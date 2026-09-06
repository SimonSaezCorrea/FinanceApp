import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";
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
import { RegisterDebtPaymentCommand } from "./register-debt-payment.command";

interface Context {
  account: BankAccount;
}

/**
 * Registers one more paid instalment AND its real money — see
 * `SettleDebtHandler`'s docstring for the rationale (same conversation,
 * "¿No genera movimiento marcarla como pagada?"). The amount here is always
 * ONE instalment's worth (`Debt.nextInstallmentAmount()`) — the whole-balance
 * case (a single-payment debt, or the last instalment of one in cuotas) goes
 * through `settle` instead, which the frontend already calls for both.
 *
 * The aggregate enforces `DEBT_ALREADY_SETTLED`/`ALL_INSTALLMENTS_PAID` and
 * auto-settles once the schedule completes.
 *
 * `paidInstallments += 1` is exactly the kind of write Constitution Principle
 * VII names as never idempotent on its own — the reservation protects a
 * RETRY of the same attempt. A genuinely concurrent second click is a
 * DIFFERENT hazard (a lost update, two reads racing one write), closed here
 * by reading the row `FOR UPDATE` inside the same transaction that mutates
 * and saves it, rather than in `loadContext` outside any transaction.
 */
@Injectable()
@CommandHandler(RegisterDebtPaymentCommand)
export class RegisterDebtPaymentHandler extends BaseIdempotentCommandHandler<
  RegisterDebtPaymentCommand,
  debts.Debt,
  Context
> {
  protected readonly operation = "debt.registerPayment";
  protected override readonly successStatus = 200;

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

  protected requestBody(command: RegisterDebtPaymentCommand): unknown {
    return { id: command.id, ...command.input };
  }

  protected async loadContext(command: RegisterDebtPaymentCommand): Promise<Context> {
    const account = await this.accounts.findById(command.userId, command.input.accountId);
    if (!account) throw new AccountNotFoundError();
    if (account.snapshot().type === "CREDIT_CARD") throw new DebtPaymentFromCreditAccountError();
    return { account };
  }

  protected async handleIdempotent(
    command: RegisterDebtPaymentCommand,
    context: Context,
    complete: CompleteFn<debts.Debt>,
  ): Promise<HandleResult<debts.Debt>> {
    const account = context.account.snapshot();

    const result = await this.prisma.$transaction(async (tx) => {
      const debt = await this.repo.findOneForUpdateWithTx(tx, command.userId, command.id);
      if (!debt) throw new DebtNotFoundError();
      if (debt.currency !== account.currency) throw new DebtPaymentCurrencyMismatchError();

      const amount = debt.nextInstallmentAmount();
      const type = debt.direction === "OWED_TO_YOU" ? ("INCOME" as const) : ("EXPENSE" as const);
      MovementPolicy.assertWithinPrepaidBalance({ type, amount }, account);
      MovementPolicy.assertWithinOverdraft({ type, amount }, account);
      MovementPolicy.assertWithinCeiling({ type, amount }, account);

      const transactionId = generateRowId();
      // `debt.registerPayment()` validates/mutates FIRST — `DEBT_ALREADY_SETTLED`/
      // `ALL_INSTALLMENTS_PAID` here must leave no transaction/balance change behind.
      debt.registerPayment({ transactionId, accountId: account.id, amount });

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
        description: snap.title
          ? `${snap.counterparty} · ${snap.title} · ${snap.paidInstallments}/${snap.totalInstallments}`
          : `${snap.counterparty} · ${snap.paidInstallments}/${snap.totalInstallments}`,
        debtId: command.id,
      });
      await this.accounts.incrementBalanceWithTx(
        tx,
        account.id,
        type === "INCOME" ? amount : subtractMoney("0", amount),
      );
      const contract = debt.toContract();
      await this.repo.saveWithTx(tx, debt);
      await complete(tx, contract);
      return contract;
    });
    return { result, events: [] };
  }
}
