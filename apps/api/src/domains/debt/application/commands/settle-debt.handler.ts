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
import { MovementPolicy } from "../../../transaction/domain/movement-policy";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import {
  DebtNotFoundError,
  DebtPaymentCurrencyMismatchError,
  DebtPaymentFromCreditAccountError,
} from "../../domain/errors";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { SettleDebtCommand } from "./settle-debt.command";

interface Context {
  account: BankAccount;
}

/**
 * Marks a debt settled AND, since specs conversation "¿No genera movimiento
 * marcarla como pagada?": records the real money it represents — an INCOME on
 * an `OWED_TO_YOU` debt (someone paid you back), an EXPENSE on `YOU_OWE` (you
 * paid). The amount is `Debt.pendingAmount()` — everything still owed,
 * whether this is a single-payment debt or the last instalment of one paid in
 * cuotas (the frontend calls `settle`, not `registerPayment`, for that case).
 *
 * The aggregate enforces `DEBT_ALREADY_SETTLED` when it already was, rather
 * than silently re-stamping `settledAt` (fixed alongside the earlier
 * idempotency feature; see `Debt.settle`).
 *
 * The read, the mutation and the write all happen INSIDE one transaction, via
 * a `SELECT ... FOR UPDATE` (`findOneForUpdateWithTx`) — not just the write.
 * Reading in `loadContext` (outside any transaction, the usual shape) and
 * writing in `persist()` looks equivalent and is not: two concurrent settles
 * would both read "not settled" before either commits. The idempotency
 * record's COMPLETED mark commits in the same transaction too, so a retry and
 * a genuine concurrent settle are both handled by the one lock. The account is
 * fetched in `loadContext` (ownership/type only — its balance is read fresh
 * inside the transaction, same pattern `PayInstallmentHandler` uses).
 */
@Injectable()
@CommandHandler(SettleDebtCommand)
export class SettleDebtHandler extends BaseIdempotentCommandHandler<
  SettleDebtCommand,
  void,
  Context
> {
  protected readonly operation = "debt.settle";
  protected override readonly successStatus = 204;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: SettleDebtCommand): unknown {
    return { id: command.id, ...command.input };
  }

  protected async loadContext(command: SettleDebtCommand): Promise<Context> {
    const account = await this.accounts.findById(command.userId, command.input.accountId);
    if (!account) throw new AccountNotFoundError();
    // Settling debt with debt: a credit account has no cash of its own to move.
    if (account.snapshot().type === "CREDIT_CARD") throw new DebtPaymentFromCreditAccountError();
    return { account };
  }

  protected async handleIdempotent(
    command: SettleDebtCommand,
    context: Context,
    complete: CompleteFn<void>,
  ): Promise<HandleResult<void>> {
    const account = context.account.snapshot();

    await this.prisma.$transaction(async (tx) => {
      const debt = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!debt) throw new DebtNotFoundError();
      if (debt.currency !== account.currency) throw new DebtPaymentCurrencyMismatchError();

      const amount = debt.pendingAmount();
      const type = debt.direction === "OWED_TO_YOU" ? ("INCOME" as const) : ("EXPENSE" as const);
      MovementPolicy.assertWithinPrepaidBalance({ type, amount }, account);
      MovementPolicy.assertWithinOverdraft({ type, amount }, account);
      MovementPolicy.assertWithinCeiling({ type, amount }, account);

      const transactionId = generateRowId();
      // `debt.settle()` validates/mutates FIRST — a `DEBT_ALREADY_SETTLED` here
      // must leave no transaction/balance change behind.
      debt.settle({ transactionId, accountId: account.id, amount });

      const snap = debt.snapshot();
      await this.transactions.createWithTx(tx, {
        id: transactionId,
        userId: command.userId,
        bankAccountId: account.id,
        type,
        amount,
        currency: account.currency,
        occurredAt: command.input.paidAt ? new Date(command.input.paidAt) : new Date(),
        category: "Deudas",
        description: snap.title ? `${snap.counterparty} · ${snap.title}` : snap.counterparty,
        debtId: command.id,
      });
      await this.accounts.incrementBalanceWithTx(
        tx,
        account.id,
        type === "INCOME" ? amount : subtractMoney("0", amount),
      );
      await this.repo.saveWithTx(tx, debt);
      await complete(tx, undefined);
    });

    return { result: undefined, events: [] };
  }
}
