import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { toMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { accounts } from "@finance/contracts";

import type { CreditStatement } from "../../domain/credit-statement.aggregate";
import {
  InvalidPaymentSourceError,
  NothingToPayError,
  StatementNotFoundError,
} from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { toStatementDto } from "../statement-dto.mapper";
import { PayCreditStatementCommand } from "./pay-credit-statement.command";

interface Context {
  account: BankAccount;
  statement: CreditStatement;
  fromAccount: BankAccount;
  /** What THIS payment settles (the whole remaining balance, or a part of it). */
  amount: string;
  /** The period's full amount (its movements + what the previous period carried
   * in), frozen into the statement once it's settled. */
  periodAmount: string;
  /** Left unpaid by this payment; rolled into the next period at persist time. */
  carryOver: string;
  breakdown: { purchases: string; installments: string; installmentCount: number };
  paymentTransactionId: string;
  now: Date;
  /** Business date of the payment — what the created expense is dated with. */
  occurredAt: Date;
  reference?: string;
}

export type PaidStatementResult = accounts.CreditStatement;

/**
 * Pays a statement by choosing a source bank account: creates a real EXPENSE
 * `Transaction`, decrements the credit account's `creditUsed`, and freezes
 * the statement PAID — one atomic action touching THREE aggregates
 * (`CreditStatement`, the new payment `Transaction`, `BankAccount`), so
 * `persist()` wraps every save in a single `prisma.$transaction(...)`
 * (FR-020, T029a) rather than three independent `save()` calls.
 */
@Injectable()
@CommandHandler(PayCreditStatementCommand)
export class PayCreditStatementHandler extends BaseCommandHandler<
  PayCreditStatementCommand,
  PaidStatementResult,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: PayCreditStatementCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const statement = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!statement) throw new StatementNotFoundError();
    const fromAccount = await this.accountRepo.findById(command.userId, command.fromAccountId);
    if (!fromAccount) throw new AccountNotFoundError();
    if (fromAccount.type === "CREDIT_LINE") throw new InvalidPaymentSourceError();
    // The period's total: frozen once settled, still the live sum otherwise.
    const periodAmount = statement.paidAt
      ? statement.amount
      : statement.totalFor(await this.statementRepo.sumLinkedTransactions(command.statementId));
    if (!toMoney(periodAmount).greaterThan(0)) throw new NothingToPayError();
    const breakdown = await this.statementRepo.breakdown(command.statementId);
    const now = new Date();
    return {
      account,
      statement,
      fromAccount,
      // No explicit amount = settle whatever is still owed. The aggregate is what
      // validates it (positive, not more than remaining) — see `pay`.
      amount: command.amount ?? statement.remainingFor(periodAmount),
      periodAmount,
      breakdown,
      carryOver: "0",
      paymentTransactionId: randomUUID(),
      now,
      occurredAt: command.paidAt ?? now,
      reference: command.reference,
    };
  }

  protected async handle(
    command: PayCreditStatementCommand,
    context: Context,
  ): Promise<HandleResult<PaidStatementResult>> {
    const { event, carryOver } = context.statement.payTowards(
      context.periodAmount,
      context.amount,
      command.fromAccountId,
      context.paymentTransactionId,
      context.occurredAt,
    );
    context.carryOver = carryOver;
    // Only what was actually paid comes off the credit pool: paying the minimum
    // frees exactly that, and the shortfall stays used — it is still owed, just
    // in the next period now.
    context.account.adjustCreditUsed(toMoney(context.amount).negated().toString());
    return {
      result: toStatementDto(context.statement, {
        amount: context.periodAmount,
        breakdown: context.breakdown,
        minimumPercent: context.account.minimumPaymentPercent,
      }),
      events: [event],
    };
  }

  // Cross-aggregate persistence (FR-020, contracts/layer-contracts.md): three
  // tables in one atomic step. Each write goes through the port of the domain
  // that owns its table (`transaction`, `credit-statement`, `bank-account`) —
  // this handler only supplies the shared `$transaction` they all enlist in, so
  // all three commit or roll back together.
  protected override async persist(context: Context): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.transactions.createWithTx(tx, {
        id: context.paymentTransactionId,
        userId: context.account.userId,
        bankAccountId: context.fromAccount.id,
        type: "EXPENSE",
        amount: context.amount,
        currency: context.account.snapshot().currency,
        occurredAt: context.occurredAt,
        category: "Pago facturación",
        description: context.account.name,
        // The user's reference for this payment (a transfer number, say) rides on
        // the movement itself, where they'll look for it later.
        observation: context.reference,
      });
      // A payment smaller than the period never leaves it half-paid: the period
      // is settled and the shortfall becomes the next period's `carriedOverAmount`
      // (its own OPEN one, or a fresh period starting where this one closed).
      if (toMoney(context.carryOver).greaterThan(0)) {
        const target = await this.statementRepo.findOrCreateCarryOverTargetWithTx(tx, {
          accountId: context.account.id,
          excludeStatementId: context.statement.id,
          periodStart: context.statement.closedAt ?? context.occurredAt,
        });
        context.statement.markCarriedTo(target.id);
        await this.statementRepo.addCarriedOverWithTx(tx, target.id, context.carryOver);
      }
      await this.statementRepo.saveWithTx(tx, context.statement);
      await this.accountRepo.saveWithTx(tx, context.account);
    });
  }
}
