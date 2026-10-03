import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { CategoryDataModule } from "../category/category.data.module";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { CardLimitDataModule } from "../card-limit/card-limit.data.module";
import { CreditStatementDataModule } from "../credit-statement/credit-statement.data.module";
import { IdempotencyRecordDataModule } from "../idempotency-record/idempotency-record.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { TRANSACTION_REPOSITORY } from "../transaction/domain/ports/transaction.repository.port";
import { PrismaTransactionRepository } from "../transaction/infrastructure/prisma-transaction.repository";
import { DebtDataModule } from "../debt/debt.data.module";
import { InstallmentPlanDataModule } from "../installment-plan/installment-plan.data.module";
import { RecurringExpenseDataModule } from "../recurring-expense/recurring-expense.data.module";
import { SavingsEntryDataModule } from "../savings-entry/savings-entry.data.module";
import { SavingsGoalDataModule } from "../savings-goal/savings-goal.data.module";
import { ImportTemplateHandler } from "./application/commands/import-template.handler";
import { ImportTransactionsHandler } from "./application/commands/import-transactions.handler";
import { PreviewTemplateQueryHandler } from "./application/queries/preview-template.handler";
import { ImportController } from "./presentation/import.controller";

const commandHandlers = [ImportTransactionsHandler, ImportTemplateHandler];
const queryHandlers = [PreviewTemplateQueryHandler];

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
    IdempotencyRecordDataModule,
    DebtDataModule,
    InstallmentPlanDataModule,
    RecurringExpenseDataModule,
    SavingsGoalDataModule,
    SavingsEntryDataModule,
  ],
  controllers: [ImportController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    // The movement table's own adapter, for `sumsForCard` (a card's sub-limit
    // usage). Same class `transaction.module.ts` binds: still the table's only
    // adapter, not a second one.
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class ImportModule {}
