import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { CreateTransactionHandler } from "./application/commands/create-transaction.handler";
import { RemoveTransactionHandler } from "./application/commands/remove-transaction.handler";
import { UpdateTransactionHandler } from "./application/commands/update-transaction.handler";
import { GetTransactionQueryHandler } from "./application/queries/get-transaction.handler";
import { ListTransactionsQueryHandler } from "./application/queries/list-transactions.handler";
import { TRANSACTION_REPOSITORY } from "./domain/ports/transaction.repository.port";
import { PrismaTransactionRepository } from "./infrastructure/prisma-transaction.repository";
import { TransactionsController } from "./presentation/transactions.controller";

const commandHandlers = [CreateTransactionHandler, UpdateTransactionHandler, RemoveTransactionHandler];

const queryHandlers = [ListTransactionsQueryHandler, GetTransactionQueryHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [TransactionsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class TransactionsModule {}
