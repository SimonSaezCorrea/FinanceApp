import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { moneyToString, subtractMoney, sumMoney, toMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import type { CreateInstallmentPlanPlan } from "../../domain/ports/installment-plan.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { CreateInstallmentPlanCommand } from "./create-installment-plan.command";

interface Context {
  plan: CreateInstallmentPlanPlan;
}

/**
 * Creates a plan, generating its equal-principal payment schedule
 * (`InstallmentPlan.planCreation`) — the actual repository write happens in
 * `handle()` (same convention `accounts`' `CreateAccountHandler` uses), so
 * `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(CreateInstallmentPlanCommand)
export class CreateInstallmentPlanHandler extends BaseCommandHandler<
  CreateInstallmentPlanCommand,
  installments.InstallmentPlan,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateInstallmentPlanCommand): Promise<Context> {
    const { input } = command;
    const cardKind = input.cardId
      ? await this.cards.kindForCard(command.userId, input.cardId)
      : null;
    InstallmentPlan.assertPaymentAccountAllowed(cardKind, input.paymentAccountId);
    const planned = InstallmentPlan.planCreation({
      title: input.title,
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      startDate: new Date(input.startDate),
      currency: input.currency,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
      aprPerPeriod: input.aprPerPeriod,
      cardId: input.cardId,
      category: input.category,
      paymentAccountId: input.paymentAccountId,
      notes: input.notes,
    });
    return { plan: planned };
  }

  protected async handle(
    command: CreateInstallmentPlanCommand,
    context: Context,
  ): Promise<HandleResult<installments.InstallmentPlan>> {
    const row = await this.repo.create(command.userId, context.plan);
    await this.recordFinanceCharge(command, row);
    return { result: row.toContract(), events: [] };
  }

  /**
   * Buying in instalments WITH interest commits more debt than the price tag: 12
   * payments of 51.667 on a 500.000 purchase is a 620.000 commitment. The purchase
   * movement only ever carries the price, so the credit pool would understate the
   * liability by exactly the finance charge — which is why the difference is
   * recorded as one, on the account the card belongs to.
   *
   * Only when the plan names a card (a bank loan has no pool to charge) and the
   * schedule really costs more than the principal.
   */
  private async recordFinanceCharge(
    command: CreateInstallmentPlanCommand,
    row: InstallmentPlan,
  ): Promise<void> {
    const plan = row.toContract();
    if (!plan.cardId) return;
    const scheduled = sumMoney(plan.payments.map((p) => p.amount));
    const interest = subtractMoney(scheduled, plan.totalPrincipal);
    if (!toMoney(interest).greaterThan(0)) return;
    const accountId = await this.cards.accountIdForCard(command.userId, plan.cardId);
    if (!accountId) return;
    await this.transactions.createWithTx(this.prisma, {
      id: randomUUID(),
      userId: command.userId,
      bankAccountId: accountId,
      type: "EXPENSE",
      amount: moneyToString(interest),
      currency: plan.currency,
      occurredAt: new Date(plan.startDate),
      category: "Intereses",
      description: plan.title,
      financeCharge: true,
    });
  }
}
