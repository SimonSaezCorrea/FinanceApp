import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

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
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { StatementNotFoundError } from "../../domain/errors";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../domain/ports/credit-statement.repository.port";
import { toStatementDto } from "../statement-dto.mapper";
import { undoStatementPaymentWithTx } from "../statement-payment-undo";
import { UndoStatementPaymentCommand } from "./undo-statement-payment.command";

interface Context {
  account: BankAccount;
  /** What the period charged: undoing its payment never changes it (its instalments stay
   * billed), so it is read up front, like undoing a transfer does. */
  breakdown: { purchases: string; installments: string; installmentCount: number };
}

/**
 * "Deshacer pago" from the billing tab: puts a paid period back to PENDING, applying exactly its
 * `paymentReversal` (`undoStatementPaymentWithTx`, the same function deleting one of the payment's
 * movements from Movimientos runs). Idempotent (form (c)); a replay with a new key finds the
 * period unpaid and answers `STATEMENT_NOT_PAID`.
 */
@Injectable()
@CommandHandler(UndoStatementPaymentCommand)
export class UndoStatementPaymentHandler extends BaseIdempotentCommandHandler<
  UndoStatementPaymentCommand,
  accounts.CreditStatement,
  Context
> {
  protected readonly operation = "creditStatement.undoPayment";
  protected override readonly successStatus = 200;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statementRepo: CreditStatementRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepositoryPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: UndoStatementPaymentCommand): unknown {
    return { accountId: command.accountId, statementId: command.statementId };
  }

  protected async loadContext(command: UndoStatementPaymentCommand): Promise<Context> {
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
    command: UndoStatementPaymentCommand,
    context: Context,
    complete: CompleteFn<accounts.CreditStatement>,
  ): Promise<HandleResult<accounts.CreditStatement>> {
    const accountCurrency = context.account.snapshot().currency;
    return await this.prisma.$transaction(async (tx) => {
      const statement = await undoStatementPaymentWithTx(
        {
          statements: this.statementRepo,
          accounts: this.accountRepo,
          transactions: this.transactions,
          plans: this.plans,
        },
        tx,
        {
          userId: command.userId,
          accountId: command.accountId,
          statementId: command.statementId,
          accountCurrency,
        },
      );
      // Unpaid again: its amount is the live total, as the list shows it.
      const { breakdown } = context;
      const result = toStatementDto(statement, {
        amount: statement.totalFor(breakdown.purchases, breakdown.installments),
        breakdown,
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
