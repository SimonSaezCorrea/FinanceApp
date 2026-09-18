import { Module } from "@nestjs/common";

import { RECURRING_EXPENSE_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { RECURRING_EXPENSE_REPOSITORY } from "./domain/ports/recurring-expense.repository.port";
import { PrismaRecurringExpenseCurrencyUsageLookupRepository } from "./infrastructure/prisma-recurring-expense-currency-usage-lookup.repository";
import { PrismaRecurringExpenseRepository } from "./infrastructure/prisma-recurring-expense.repository";

/**
 * Leaf data module for the `recurring-expense` table: the aggregate's
 * port→adapter binding only, no controller/handlers — so other domains
 * (e.g. `user`, for the currency-in-use lookup) can depend on this
 * repository without pulling in `RecurringExpenseModule`'s full
 * orchestration graph, which is what keeps the module graph acyclic
 * (specs/020).
 */
@Module({
  providers: [
    { provide: RECURRING_EXPENSE_REPOSITORY, useClass: PrismaRecurringExpenseRepository },
    {
      provide: RECURRING_EXPENSE_CURRENCY_USAGE,
      useClass: PrismaRecurringExpenseCurrencyUsageLookupRepository,
    },
  ],
  exports: [RECURRING_EXPENSE_REPOSITORY, RECURRING_EXPENSE_CURRENCY_USAGE],
})
export class RecurringExpenseDataModule {}
