import { Module } from "@nestjs/common";

import { TRANSACTION_FIELD_VALUE_REPOSITORY } from "./domain/ports/transaction-field-value.repository.port";
import { PrismaTransactionFieldValueRepository } from "./infrastructure/prisma-transaction-field-value.repository";

/**
 * Leaf data module for the `transaction-field-value` table (specs/036). The table has
 * no commands of its own: `custom-field` (editing, bulk assignment), `transaction`
 * (defaults, filters, "Transferir pendientes") and `import` write and read it through
 * this port, always after the `CustomField` aggregate validated the value.
 */
@Module({
  providers: [
    {
      provide: TRANSACTION_FIELD_VALUE_REPOSITORY,
      useClass: PrismaTransactionFieldValueRepository,
    },
  ],
  exports: [TRANSACTION_FIELD_VALUE_REPOSITORY],
})
export class TransactionFieldValueDataModule {}
