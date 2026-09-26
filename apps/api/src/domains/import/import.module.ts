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
import { ImportTransactionsHandler } from "./application/commands/import-transactions.handler";
import { ImportController } from "./presentation/import.controller";

const commandHandlers = [ImportTransactionsHandler];

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
  ],
  controllers: [ImportController],
  providers: [
    ...commandHandlers,
    // The movement table's own adapter, for `sumsForCard` (a card's sub-limit
    // usage). Same class `transaction.module.ts` binds: still the table's only
    // adapter, not a second one.
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class ImportModule {}
