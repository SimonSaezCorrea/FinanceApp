import { Module } from "@nestjs/common";

import { SAVINGS_ENTRY_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { SAVINGS_ENTRY_REPOSITORY } from "./domain/ports/savings-entry.repository.port";
import { PrismaSavingsEntryCurrencyUsageLookupRepository } from "./infrastructure/prisma-savings-entry-currency-usage-lookup.repository";
import { PrismaSavingsEntryRepository } from "./infrastructure/prisma-savings-entry.repository";

/**
 * Leaf data module for the `savings-entry` table (a contribution toward a goal).
 * Not an aggregate root: an entry only exists under a `SavingsGoal`, whose
 * handlers own the rules — this module just owns the table.
 */
@Module({
  providers: [
    { provide: SAVINGS_ENTRY_REPOSITORY, useClass: PrismaSavingsEntryRepository },
    {
      provide: SAVINGS_ENTRY_CURRENCY_USAGE,
      useClass: PrismaSavingsEntryCurrencyUsageLookupRepository,
    },
  ],
  exports: [SAVINGS_ENTRY_REPOSITORY, SAVINGS_ENTRY_CURRENCY_USAGE],
})
export class SavingsEntryDataModule {}
