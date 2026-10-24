import { Module } from "@nestjs/common";

import { TRANSACTION_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { TRANSACTION_SCOPE_LOOKUP } from "./domain/ports/transaction-scope-lookup.port";
import { TRANSACTION_SUMS_REPOSITORY } from "./domain/ports/transaction-sums.repository.port";
import { TRANSACTION_WRITER_REPOSITORY } from "./domain/ports/transaction-writer.repository.port";
import { PrismaTransactionCurrencyUsageLookupRepository } from "./infrastructure/prisma-transaction-currency-usage-lookup.repository";
import { PrismaTransactionScopeLookupRepository } from "./infrastructure/prisma-transaction-scope-lookup.repository";
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
    {
      provide: TRANSACTION_CURRENCY_USAGE,
      useClass: PrismaTransactionCurrencyUsageLookupRepository,
    },
    // What a custom field's scope or a bulk action covers (specs/036).
    { provide: TRANSACTION_SCOPE_LOOKUP, useClass: PrismaTransactionScopeLookupRepository },
  ],
  exports: [
    TRANSACTION_SUMS_REPOSITORY,
    TRANSACTION_WRITER_REPOSITORY,
    TRANSACTION_CURRENCY_USAGE,
    TRANSACTION_SCOPE_LOOKUP,
  ],
})
export class TransactionDataModule {}
