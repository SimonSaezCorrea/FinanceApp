import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { accounts as accountsRules, type accounts } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import type { BankAccount } from "../../../bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { StatementNotFoundError, StatementNotTransferableError } from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { settlementCardId } from "../foreign-settlement";
import { toStatementDto } from "../statement-dto.mapper";
import { TransferStatementCommand } from "./transfer-statement.command";

interface Context {
  account: BankAccount;
  breakdown: { purchases: string; installments: string; installmentCount: number };
  settlementTransactionId: string;
  transferTransactionId: string;
  now: Date;
  occurredAt: Date;
}

/**
 * Spec 028 US3 (research R6): an overdue period in another currency, converted by the bank into
 * a charge on the account's own currency. In ONE `$transaction`:
 *
 * 1. an INCOME settlement, in the period's currency, for what it still owed, on the primary card
 *    that holds that limit (`settlesStatementId`, no period) — what frees the limit;
 * 2. the charge, in the account's currency, on the credit account itself: an issuer charge with
 *    no card (`financeCharge`, category `CURRENCY_TRANSFER`), linked to the OPEN period of that
 *    currency, raising `creditUsed` — exactly how the bank bills it in the next statement;
 * 3. the period marked TRANSFERRED (`transferTowards`).
 *
 * The two amounts are never compared: the charge is what the bank's statement says.
 */
@Injectable()
@CommandHandler(TransferStatementCommand)
export class TransferStatementHandler extends BaseIdempotentCommandHandler<
  TransferStatementCommand,
  accounts.CreditStatement,
  Context
> {
  protected readonly operation = "creditStatement.transfer";
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
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: TransferStatementCommand): unknown {
    return {
      accountId: command.accountId,
      statementId: command.statementId,
      amount: command.amount,
      transferredAt: command.transferredAt,
    };
  }

  protected async loadContext(command: TransferStatementCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const exists = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!exists) throw new StatementNotFoundError();
    const now = new Date();
    return {
      account,
      breakdown: await this.statementRepo.breakdown(command.statementId),
      settlementTransactionId: generateRowId(),
      transferTransactionId: generateRowId(),
      now,
      occurredAt: command.transferredAt ?? now,
    };
  }

  protected async handleIdempotent(
    command: TransferStatementCommand,
    context: Context,
    complete: CompleteFn<accounts.CreditStatement>,
  ): Promise<HandleResult<accounts.CreditStatement>> {
    const accountCurrency = context.account.snapshot().currency;
    return await this.prisma.$transaction(async (tx) => {
      // Locked: a concurrent payment or a second transfer serializes here.
      const statement = await this.statementRepo.findByIdForUpdateWithTx(
        tx,
        command.userId,
        command.accountId,
        command.statementId,
      );
      if (!statement) throw new StatementNotFoundError();
      const periodAmount = statement.totalFor(
        context.breakdown.purchases,
        context.breakdown.installments,
      );
      // The SAME rule the button follows (`canTransfer` on the DTO).
      const transferable = accountsRules.canTransferStatement(
        {
          currency: statement.currency,
          closedAt: statement.closedAt?.toISOString() ?? null,
          paidAt: statement.paidAt?.toISOString() ?? null,
          transferredAt: statement.transferredAt?.toISOString() ?? null,
          remainingAmount: statement.remainingFor(periodAmount),
          dueDate: statement.dueDate?.toISOString() ?? null,
        },
        accountCurrency,
        context.now,
      );
      if (!transferable) throw new StatementNotTransferableError();

      // The charge lands where the bank bills it: the account-currency period open now.
      const receiving = await this.statementRepo.findOrCreateOpenForAccountWithTx(
        tx,
        context.account.id,
        context.occurredAt,
        accountCurrency,
        context.occurredAt,
      );
      const { settled } = statement.transferTowards(
        periodAmount,
        command.amount,
        {
          settlementTransactionId: context.settlementTransactionId,
          transferTransactionId: context.transferTransactionId,
          toStatementId: receiving.id,
        },
        context.occurredAt,
      );
      const categoryId = await this.categories.idForSystemCode("CURRENCY_TRANSFER");

      await this.transactions.createWithTx(tx, {
        id: context.settlementTransactionId,
        userId: context.account.userId,
        bankAccountId: context.account.id,
        type: "INCOME",
        amount: settled,
        currency: statement.currency,
        occurredAt: context.occurredAt,
        categoryId,
        description: context.account.name,
        cardId: settlementCardId(context.account, statement.currency),
        creditStatementId: null,
        settlesStatementId: statement.id,
      });
      await this.transactions.createWithTx(tx, {
        id: context.transferTransactionId,
        userId: context.account.userId,
        bankAccountId: context.account.id,
        type: "EXPENSE",
        amount: moneyToString(command.amount),
        currency: accountCurrency,
        occurredAt: context.occurredAt,
        categoryId,
        description: context.account.name,
        financeCharge: true,
        creditStatementId: receiving.id,
      });
      // Atomic relative update: the pool now owes the converted debt.
      await this.accountRepo.incrementCreditUsedWithTx(
        tx,
        context.account.id,
        moneyToString(command.amount),
      );
      await this.statementRepo.saveWithTx(tx, statement);

      const result = toStatementDto(statement, {
        amount: periodAmount,
        breakdown: context.breakdown,
        minimumPercent: context.account.minimumPaymentPercent,
        paymentDueDay: context.account.paymentDueDay,
        paymentDueCycleType: context.account.paymentDueCycleType,
        billingCycleDay: context.account.billingCycleDay,
        billingCycleType: context.account.billingCycleType,
        accountCurrency,
        today: context.now,
      });
      await complete(tx, result);
      return { result, events: [] };
    });
  }
}
