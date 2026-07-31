import { Module } from "@nestjs/common";

import { TRANSACTION_SUMS_REPOSITORY } from "./domain/ports/transaction-sums.repository.port";
import { TRANSACTION_WRITER_REPOSITORY } from "./domain/ports/transaction-writer.repository.port";
import { PrismaTransactionSumsRepository } from "./infrastructure/prisma-transaction-sums.repository";
import { PrismaTransactionWriterRepository } from "./infrastructure/prisma-transaction-writer.repository";

/**
 * Leaf data module for the `transaction` table, exposing only what OTHER
 * table-domains need from it (sums for `bank-account`/`credit-statement`, and a
 * write used inside `credit-statement`'s payment transaction). The movement
 * domain's own commands/queries/controller live in `transaction.module.ts` — the
 * split exists so those consumers don't pull in this table's whole orchestration
 * (and so the module graph stays acyclic).
 */
@Module({
  providers: [
    { provide: TRANSACTION_SUMS_REPOSITORY, useClass: PrismaTransactionSumsRepository },
    { provide: TRANSACTION_WRITER_REPOSITORY, useClass: PrismaTransactionWriterRepository },
  ],
  exports: [TRANSACTION_SUMS_REPOSITORY, TRANSACTION_WRITER_REPOSITORY],
})
export class TransactionDataModule {}
