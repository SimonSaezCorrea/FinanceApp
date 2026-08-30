import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { moneyToString, subtractMoney, sumMoney, toMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type CreateInstallmentPlanPlan,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { CreateInstallmentPlanCommand } from "./create-installment-plan.command";

interface Context {
  plan: CreateInstallmentPlanPlan;
  /** The account the plan's card belongs to, when it is a CREDIT card. Null for every
   * other plan, and that null is what keeps this feature out of their way (FR-005). */
  creditAccountId: string | null;
}

/**
 * Creates a plan and, when it was bought with a CREDIT card, the money it commits.
 *
 * Two charges land on the card's account, and they are NOT the same thing:
 *
 * - the **purchase** for the plan's principal, carrying `installmentPlanId` — the
 *   issuer reserves the whole amount on purchase day (FR-001/FR-002), which is why
 *   available credit drops by 1.080.000 the moment a 12 × 90.000 plan is registered.
 *   Carrying the plan id is also what excludes it from any period's total (FR-007):
 *   what a period charges is the plan's SCHEDULE, one instalment at a time.
 * - the **interest**, when the schedule costs more than the principal — an issuer
 *   charge with no plastic behind it, deliberately WITHOUT a plan id so it keeps
 *   billing in the month it happened, like any other charge.
 *
 * All of it commits in one `prisma.$transaction`: a plan whose purchase never landed
 * would understate the pool with nothing left to detect it.
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
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
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
    // Only a CREDIT card puts the purchase on a credit line. A debit or prepaid card
    // spends money that already left the account, and a bank loan has no pool at all.
    const creditAccountId =
      cardKind === "CREDIT" && input.cardId
        ? await this.cards.accountIdForCard(command.userId, input.cardId)
        : null;
    return { plan: planned, creditAccountId };
  }

  protected async handle(
    command: CreateInstallmentPlanCommand,
    context: Context,
  ): Promise<HandleResult<installments.InstallmentPlan>> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await this.repo.createWithTx(tx, command.userId, context.plan);
      await this.recordCreditCharges(tx, command.userId, created, context.creditAccountId);
      return created;
    });
    return { result: row.toContract(), events: [] };
  }

  /**
   * The purchase, and the interest when the schedule costs more than the price.
   * Both consume the pool; neither is folded into the other.
   */
  private async recordCreditCharges(
    tx: unknown,
    userId: string,
    row: InstallmentPlan,
    accountId: string | null,
  ): Promise<void> {
    if (!accountId) return;
    const plan = row.toContract();

    await this.charge(tx, {
      userId,
      accountId,
      amount: plan.totalPrincipal,
      currency: plan.currency,
      occurredAt: new Date(plan.startDate),
      category: plan.category,
      description: plan.title,
      cardId: plan.cardId,
      installmentPlanId: plan.id,
    });

    const scheduled = sumMoney(plan.payments.map((p) => p.amount));
    const interest = subtractMoney(scheduled, plan.totalPrincipal);
    if (!toMoney(interest).greaterThan(0)) return;
    await this.charge(tx, {
      userId,
      accountId,
      amount: moneyToString(interest),
      currency: plan.currency,
      occurredAt: new Date(plan.startDate),
      category: "Intereses",
      description: plan.title,
      // An issuer charge: no card made it, and it bills in its own period like any
      // ordinary charge — hence no `installmentPlanId`.
      financeCharge: true,
    });
  }

  /** One movement on the credit account plus the pool it consumes. A charge against a
   * credit line moves no cash (FR-002a): the money leaves once, later, when the
   * statement is paid. */
  private async charge(
    tx: unknown,
    input: {
      userId: string;
      accountId: string;
      amount: string;
      currency: string;
      occurredAt: Date;
      category: string | null;
      description: string;
      cardId?: string | null;
      installmentPlanId?: string;
      financeCharge?: boolean;
    },
  ): Promise<void> {
    await this.transactions.createWithTx(tx, {
      id: randomUUID(),
      userId: input.userId,
      bankAccountId: input.accountId,
      type: "EXPENSE",
      amount: input.amount,
      currency: input.currency,
      occurredAt: input.occurredAt,
      category: input.category,
      description: input.description,
      ...(input.cardId ? { cardId: input.cardId } : {}),
      ...(input.installmentPlanId ? { installmentPlanId: input.installmentPlanId } : {}),
      ...(input.financeCharge ? { financeCharge: true } : {}),
    });
    await this.accounts.incrementCreditUsedWithTx(tx, input.accountId, input.amount);
  }
}
