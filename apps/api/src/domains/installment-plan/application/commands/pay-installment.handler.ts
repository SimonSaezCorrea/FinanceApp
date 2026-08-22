import { randomUUID } from "node:crypto";

import { installments } from "@finance/contracts";
import { subtractMoney } from "@finance/money";
import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import { MovementPolicy } from "../../../transaction/domain/movement-policy";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import {
  InstallmentCardIsCreditError,
  InstallmentPaymentAccountRequiredError,
  InstallmentPaymentFromCreditAccountError,
  InstallmentPlanNotFoundError,
  PaymentCurrencyAmbiguousError,
} from "../../domain/errors";
import type { CarryDelta } from "../../domain/installment-carry-over";
import type { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { PayInstallmentCommand } from "./pay-installment.command";

interface Context {
  plan: InstallmentPlan;
  sequence: number;
  paidAt: Date;
  /** Null on a CREDIT-card plan: the instalment is only marked. */
  source: BankAccount | null;
  /** What leaves the account, in the ACCOUNT's currency. */
  chargedAmount: string;
  /** What is credited to the debt, in the PLAN's currency. */
  paidAmount: string;
  transactionId: string | null;
  carryDeltas: CarryDelta[];
}

/**
 * Paying one instalment: mark it, record the real expense, move the paying account's
 * balance and apply the carry-over — all four or none (FR-019a).
 *
 * The atomicity is why `persist()` is overridden with a single
 * `prisma.$transaction`: an instalment marked paid whose expense never landed, or an
 * expense with no balance movement, leaves the books wrong with nothing to detect it.
 * It writes three aggregates at once, which is the documented pragmatic exception the
 * constitution allows and which `PayCreditStatementHandler` already exercises — this
 * mirrors that handler deliberately rather than inventing a second answer.
 */
@Injectable()
@CommandHandler(PayInstallmentCommand)
export class PayInstallmentHandler extends BaseCommandHandler<
  PayInstallmentCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    private readonly prisma: PrismaService,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: PayInstallmentCommand): Promise<Context> {
    const plan = await this.repo.findOne(command.userId, command.planId);
    if (!plan) throw new InstallmentPlanNotFoundError();

    // Before anything else: an instalment that does not exist is a 404, not a
    // complaint about the payment account.
    plan.assertHasInstallment(command.sequence);

    const snapshot = plan.snapshot();
    const cardKind = snapshot.cardId
      ? await this.cards.kindForCard(command.userId, snapshot.cardId)
      : null;
    const recordsMovement = installments.generatesMovementOnPay(cardKind);

    // A CREDIT-card plan's purchase is already on that card's statement. Recording an
    // expense per instalment would count the same debt twice, so this path only marks
    // — and a caller that passed an account is asking for exactly that double count.
    if (!recordsMovement) {
      if (command.fromAccountId) throw new InstallmentCardIsCreditError();
      return this.markOnlyContext(command, plan);
    }

    if (!command.fromAccountId) throw new InstallmentPaymentAccountRequiredError();
    const source = await this.accounts.findById(command.userId, command.fromAccountId);
    // Someone else's account is not "forbidden", it does not exist for this user.
    if (!source) throw new AccountNotFoundError();

    const account = source.snapshot();
    // Settling debt with debt: no money leaves, and the credit pool would be
    // distorted. Same rule a transfer already applies to a credit destination.
    if (account.type === "CREDIT_CARD") throw new InstallmentPaymentFromCreditAccountError();

    const paidAt = command.paidAt ?? new Date();
    const { paidAmount, chargedAmount } = this.resolveAmounts(command, plan, account.currency);

    return {
      plan,
      sequence: command.sequence,
      paidAt,
      source,
      chargedAmount,
      paidAmount,
      transactionId: randomUUID(),
      carryDeltas: [],
    };
  }

  /**
   * The two amounts (FR-030/FR-031).
   *
   * When the account and the plan share a currency — the ordinary case — one figure
   * answers both questions. When they differ, they are genuinely two facts and this
   * app has no exchange rate to derive one from the other, so it refuses to guess.
   */
  private resolveAmounts(
    command: PayInstallmentCommand,
    plan: InstallmentPlan,
    accountCurrency: string,
  ): { paidAmount: string; chargedAmount: string } {
    const owed = plan.owedOn(command.sequence);
    const paidAmount = command.amount ?? owed;
    const sameCurrency = accountCurrency === plan.snapshot().currency;

    if (sameCurrency) {
      return { paidAmount, chargedAmount: command.chargedAmount ?? paidAmount };
    }
    if (!command.chargedAmount) throw new PaymentCurrencyAmbiguousError();
    return { paidAmount, chargedAmount: command.chargedAmount };
  }

  private markOnlyContext(command: PayInstallmentCommand, plan: InstallmentPlan): Context {
    return {
      plan,
      sequence: command.sequence,
      paidAt: command.paidAt ?? new Date(),
      source: null,
      chargedAmount: "0",
      paidAmount: command.amount ?? plan.owedOn(command.sequence),
      transactionId: null,
      carryDeltas: [],
    };
  }

  protected async handle(
    _command: PayInstallmentCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    if (context.source) {
      const account = context.source.snapshot();
      const movement = {
        type: "EXPENSE" as const,
        amount: context.chargedAmount,
      };
      // The account rules that already exist elsewhere, applied here rather than
      // re-stated: a prepaid account can never go negative, an overdraft has a floor,
      // and a bare low balance on an account that MAY go negative is not a refusal.
      MovementPolicy.assertWithinPrepaidBalance(movement, {
        type: account.type,
        currentBalance: account.currentBalance,
      });
      MovementPolicy.assertWithinOverdraft(movement, {
        type: account.type,
        currentBalance: account.currentBalance,
        overdraftLimit: account.overdraftLimit,
      });
    }

    const { carryDeltas } = context.plan.payInstallment(
      context.sequence,
      context.paidAmount,
      context.paidAt,
      context.transactionId,
    );
    context.carryDeltas = carryDeltas;
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (context.source && context.transactionId) {
        const account = context.source.snapshot();
        const plan = context.plan.snapshot();
        await this.transactions.createWithTx(tx, {
          id: context.transactionId,
          userId: plan.userId,
          bankAccountId: account.id,
          type: "EXPENSE",
          amount: context.chargedAmount,
          // The ACCOUNT's currency, not the plan's: this row describes money that
          // left this account (FR-030).
          currency: account.currency,
          occurredAt: context.paidAt,
          category: plan.category,
          description: `${plan.title} · ${context.sequence}/${plan.installmentCount}`,
          installmentPlanId: plan.id,
        });
        await this.accountsBalance(tx, account.id, context.chargedAmount);
      }
      await this.repo.savePaymentWithTx(tx, context.plan, context.sequence, context.carryDeltas);
    });
  }

  private async accountsBalance(tx: unknown, accountId: string, amount: string): Promise<void> {
    await this.accounts.incrementBalanceWithTx(tx, accountId, subtractMoney("0", amount));
  }
}
