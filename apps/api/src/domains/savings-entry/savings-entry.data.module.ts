import { Module } from "@nestjs/common";

import { SAVINGS_ENTRY_REPOSITORY } from "./domain/ports/savings-entry.repository.port";
import { PrismaSavingsEntryRepository } from "./infrastructure/prisma-savings-entry.repository";

/**
 * Leaf data module for the `savings-entry` table (a contribution toward a goal).
 * Not an aggregate root: an entry only exists under a `SavingsGoal`, whose
 * handlers own the rules — this module just owns the table.
 */
@Module({
  providers: [{ provide: SAVINGS_ENTRY_REPOSITORY, useClass: PrismaSavingsEntryRepository }],
  exports: [SAVINGS_ENTRY_REPOSITORY],
})
export class SavingsEntryDataModule {}
