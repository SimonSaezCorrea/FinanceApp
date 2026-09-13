import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { subtractMoney } from "@finance/money";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
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

import { InvalidPaymentSourceError, StatementNotFoundError } from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { toStatementDto } from "../statement-dto.mapper";
import { PrepayOpenPeriodCommand } from "./prepay-open-period.command";

interface Context {
  account: BankAccount;
  fromAccount: BankAccount;
  /** The breakdown as read BEFORE the row lock — safe to read early because
   * concurrent prepagos never change purchases/instalments/carry-over, only
   * `prepaidAmount` (which the lock DOES protect — see `handleIdempotent`). */
  breakdown: { purchases: string; installments: string; installmentCount: number };
  paymentTransactionId: string;
  now: Date;
  occurredAt: Date;
  reference?: string;
}

export type PrepaidStatementResult = accounts.CreditStatement;

/**
 * Spec 019: abona against the account's currently OPEN period, WITHOUT
 * closing it — `CreditStatement.changePrepayment` only raises `prepaidAmount`
 * and never touches `closedAt`/`paidAt` (unlike `PayCreditStatementHandler`'s
 * `payTowards`, which always settles). One atomic action touching THREE
 * aggregates (`CreditStatement`, the new EXPENSE `Transaction`, `BankAccount`),
 * same cross-aggregate `prisma.$transaction` pattern as
 * `PayCreditStatementHandler` (`research.md` R5).
 *
 * `research.md` R8: the `CreditStatement` row is re-read LOCKED
 * (`findByIdForUpdateWithTx`) INSIDE the transaction, right before
 * `changePrepayment` — two prepagos with different idempotency keys racing
 * each other must serialize on this lock, not on the idempotency reservation
 * (which only serializes retries of the SAME key).
 */
@Injectable()
@CommandHandler(PrepayOpenPeriodCommand)
export class PrepayOpenPeriodHandler extends BaseIdempotentCommandHandler<
  PrepayOpenPeriodCommand,
  PrepaidStatementResult,
  Context
> {
  protected readonly operation = "creditStatement.prepay";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: PrepayOpenPeriodCommand): unknown {
    return {
      accountId: command.accountId,
      statementId: command.statementId,
      fromAccountId: command.fromAccountId,
      amount: command.amount,
      paidAt: command.paidAt,
      reference: command.reference,
    };
  }

  protected async loadContext(command: PrepayOpenPeriodCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    // Existence check only — the authoritative, LOCKED read happens inside the
    // transaction (see `handleIdempotent`). This early check just fails fast
    // with `STATEMENT_NOT_FOUND` before touching the source account at all.
    const exists = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!exists) throw new StatementNotFoundError();
    const fromAccount = await this.accountRepo.findById(command.userId, command.fromAccountId);
    if (!fromAccount) throw new AccountNotFoundError();
    if (fromAccount.type === "CREDIT_CARD") throw new InvalidPaymentSourceError();
    const breakdown = await this.statementRepo.breakdown(command.statementId);
    const now = new Date();
    return {
      account,
      fromAccount,
      breakdown,
      paymentTransactionId: generateRowId(),
      now,
      occurredAt: command.paidAt ?? now,
      reference: command.reference,
    };
  }

  protected async handleIdempotent(
    command: PrepayOpenPeriodCommand,
    context: Context,
    complete: CompleteFn<PrepaidStatementResult>,
  ): Promise<HandleResult<PrepaidStatementResult>> {
    return await this.prisma.$transaction(async (tx) => {
      // Locked read: this is the ONLY read of `prepaidAmount` that matters —
      // two concurrent prepagos serialize here, not on the idempotency key.
      const statement = await this.statementRepo.findByIdForUpdateWithTx(
        tx,
        command.userId,
        command.accountId,
        command.statementId,
      );
      if (!statement) throw new StatementNotFoundError();

      const grossTotal = statement.grossTotalFor(
        context.breakdown.purchases,
        context.breakdown.installments,
      );
      statement.changePrepayment(grossTotal, "0", command.amount);

      await this.transactions.createWithTx(tx, {
        id: context.paymentTransactionId,
        userId: context.account.userId,
        bankAccountId: context.fromAccount.id,
        type: "EXPENSE",
        amount: command.amount,
        currency: context.account.snapshot().currency,
        occurredAt: context.occurredAt,
        category: "Prepago tarjeta",
        description: context.account.name,
        observation: context.reference,
        prepaymentStatementId: statement.id,
        prepaymentAccountId: context.account.id,
      });
      await this.accountRepo.incrementBalanceWithTx(
        tx,
        context.fromAccount.id,
        subtractMoney("0", command.amount),
      );
      // Atomic relative update (`creditUsed = creditUsed - amount`), NOT
      // `context.account`'s in-memory `adjustCreditUsed` + `saveWithTx` (an
      // absolute overwrite from a snapshot read BEFORE the lock above) — two
      // concurrent prepagos would otherwise both compute their delta off the
      // same stale figure and the loser's write would clobber the winner's,
      // silently losing a decrement even though the STATEMENT side serialized
      // correctly. `research.md` R8 covers the statement; this is its account
      // side counterpart, found by `T023b`'s own concurrency test.
      await this.accountRepo.incrementCreditUsedWithTx(
        tx,
        context.account.id,
        subtractMoney("0", command.amount),
      );
      await this.statementRepo.saveWithTx(tx, statement);

      const result = toStatementDto(statement, {
        amount: statement.totalFor(context.breakdown.purchases, context.breakdown.installments),
        breakdown: context.breakdown,
        minimumPercent: context.account.minimumPaymentPercent,
        paymentDueDay: context.account.paymentDueDay,
        paymentDueCycleType: context.account.paymentDueCycleType,
        billingCycleDay: context.account.billingCycleDay,
        billingCycleType: context.account.billingCycleType,
      });
      await complete(tx, result);
      return { result, events: [] };
    });
  }
}
