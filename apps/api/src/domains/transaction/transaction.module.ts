import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { RecurringExpenseDataModule } from "../recurring-expense/recurring-expense.data.module";
import { CategoryDataModule } from "../category/category.data.module";
import { CustomFieldDataModule } from "../custom-field/custom-field.data.module";
import { TransactionFieldValueDataModule } from "../transaction-field-value/transaction-field-value.data.module";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { CardLimitDataModule } from "../card-limit/card-limit.data.module";
import { CreditStatementDataModule } from "../credit-statement/credit-statement.data.module";
import { IdempotencyRecordDataModule } from "../idempotency-record/idempotency-record.data.module";
import { InstallmentPaymentDataModule } from "../installment-payment/installment-payment.data.module";
import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { CreateTransactionHandler } from "./application/commands/create-transaction.handler";
import { CoverWithTransferHandler } from "./application/commands/cover-with-transfer.handler";
import { CreateTransferHandler } from "./application/commands/create-transfer.handler";
import { RemoveTransferHandler } from "./application/commands/remove-transfer.handler";
import { UpdateTransferHandler } from "./application/commands/update-transfer.handler";
import { GetTransferQueryHandler } from "./application/queries/get-transfer.handler";
import { RemoveTransactionHandler } from "./application/commands/remove-transaction.handler";
import { UpdateTransactionHandler } from "./application/commands/update-transaction.handler";
import { GetTransactionQueryHandler } from "./application/queries/get-transaction.handler";
import { ListTransactionsQueryHandler } from "./application/queries/list-transactions.handler";
import { SummarizeByFieldQueryHandler } from "./application/queries/summarize-by-field.handler";
import { SummarizeTransactionsQueryHandler } from "./application/queries/summarize-transactions.handler";
import { TRANSACTION_REPOSITORY } from "./domain/ports/transaction.repository.port";
import { PrismaTransactionRepository } from "./infrastructure/prisma-transaction.repository";
import { TransactionsController } from "./presentation/transactions.controller";
import { TransactionDataModule } from "./transaction.data.module";

const commandHandlers = [
  CreateTransactionHandler,
  UpdateTransactionHandler,
  RemoveTransactionHandler,
  CreateTransferHandler,
  UpdateTransferHandler,
  RemoveTransferHandler,
  CoverWithTransferHandler,
];

const queryHandlers = [
  ListTransactionsQueryHandler,
  SummarizeTransactionsQueryHandler,
  SummarizeByFieldQueryHandler,
  GetTransactionQueryHandler,
  GetTransferQueryHandler,
];

/**
 * Orchestration module for the `transaction` table. A movement is validated
 * against four OTHER tables (account type + credit pool, the card and its kind,
 * that card's own sub-limit, the open billing period), so it imports those
 * tables' leaf data modules — reading each through its owner's port instead of
 * joining across boundaries.
 */
@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    CategoryDataModule,
    TransactionDataModule,
    BankAccountDataModule,
    CardAccountDataModule,
    CardLimitDataModule,
    CreditStatementDataModule,
    // A movement backing an instalment is read-only here: it is corrected by undoing
    // and re-paying the instalment, never edited in place (FR-028a).
    InstallmentPaymentDataModule,
    // Deleting a statement's payment undoes it, and that unpays the instalments it settled.
    InstallmentPlanDataModule,
    // Retry-safety for `create`/`createTransfer` (Constitution Principle VII).
    IdempotencyRecordDataModule,
    // A movement may name the recurring series it pays — ownership-checked here.
    RecurringExpenseDataModule,
    // Custom fields (specs/036): defaults on creation, values on reads, the filter.
    CustomFieldDataModule,
    TransactionFieldValueDataModule,
  ],
  controllers: [TransactionsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    JwtAuthGuard,
  ],
  // Exported so the `transaction-attachment` domain can check a movement's
  // ownership through THIS table's own adapter instead of querying it itself.
  exports: [TRANSACTION_REPOSITORY],
})
export class TransactionModule {}
