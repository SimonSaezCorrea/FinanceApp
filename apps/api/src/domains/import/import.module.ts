import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { ImportTransactionsHandler } from "./application/commands/import-transactions.handler";
import { IMPORT_TRANSACTIONS_REPOSITORY } from "./domain/ports/import-transactions.repository.port";
import { PrismaImportRepository } from "./infrastructure/prisma-import.repository";
import { ImportController } from "./presentation/import.controller";

const commandHandlers = [ImportTransactionsHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({}), TransactionDataModule],
  controllers: [ImportController],
  providers: [
    ...commandHandlers,
    { provide: IMPORT_TRANSACTIONS_REPOSITORY, useClass: PrismaImportRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class ImportModule {}
