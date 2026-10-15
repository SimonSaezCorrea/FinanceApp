import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
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
import { StatementNotFoundError, TransferAlreadyBilledError } from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { toStatementDto } from "../statement-dto.mapper";
import { UndoTransferStatementCommand } from "./undo-transfer-statement.command";

interface Context {
  account: BankAccount;
  breakdown: { purchases: string; installments: string; installmentCount: number };
}

/**
 * Spec 028 US3 (research R9): puts a TRANSFERRED period back to PENDING, applying EXACTLY
 * `statement.undoTransfer()` — the same `transferReversal` the confirmation showed: both
 * movements deleted, `creditUsed` lowered by the charge. Refused once the account-currency period
 * that received the charge is settled (`TRANSFER_ALREADY_BILLED`): that money was already paid,
 * and undoing it would rewrite a closed period.
 */
@Injectable()
@CommandHandler(UndoTransferStatementCommand)
export class UndoTransferStatementHandler extends BaseIdempotentCommandHandler<
  UndoTransferStatementCommand,
  accounts.CreditStatement,
  Context
> {
  protected readonly operation = "creditStatement.undoTransfer";
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

  protected requestBody(command: UndoTransferStatementCommand): unknown {
    return { accountId: command.accountId, statementId: command.statementId };
  }

  protected async loadContext(command: UndoTransferStatementCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const exists = await this.statementRepo.findById(
      command.userId,
      command.accountId,
      command.statementId,
    );
    if (!exists) throw new StatementNotFoundError();
    return { account, breakdown: await this.statementRepo.breakdown(command.statementId) };
  }

  protected async handleIdempotent(
    command: UndoTransferStatementCommand,
    context: Context,
    complete: CompleteFn<accounts.CreditStatement>,
  ): Promise<HandleResult<accounts.CreditStatement>> {
    const accountCurrency = context.account.snapshot().currency;
    return await this.prisma.$transaction(async (tx) => {
      const statement = await this.statementRepo.findByIdForUpdateWithTx(
        tx,
        command.userId,
        command.accountId,
        command.statementId,
      );
      if (!statement) throw new StatementNotFoundError();
      // Throws STATEMENT_NOT_TRANSFERRED unless it is.
      const reversal = statement.undoTransfer(accountCurrency);
      if (await this.statementRepo.isPaid(reversal.receivingStatementId)) {
        throw new TransferAlreadyBilledError();
      }

      await this.transactions.deleteManyWithTx(tx, [
        reversal.settlementTransactionId,
        reversal.transferTransactionId,
      ]);
      await this.accountRepo.incrementCreditUsedWithTx(
        tx,
        context.account.id,
        subtractMoney("0", reversal.removedAmount),
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
        accountCurrency,
      });
      await complete(tx, result);
      return { result, events: [] };
    });
  }
}
