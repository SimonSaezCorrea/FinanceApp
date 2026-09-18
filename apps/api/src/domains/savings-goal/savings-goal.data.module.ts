import { Module } from "@nestjs/common";

import { SAVINGS_GOAL_CURRENCY_USAGE } from "./domain/ports/currency-usage-lookup.port";
import { SAVINGS_GOAL_REPOSITORY } from "./domain/ports/savings-goal.repository.port";
import { PrismaSavingsGoalCurrencyUsageLookupRepository } from "./infrastructure/prisma-savings-goal-currency-usage-lookup.repository";
import { PrismaSavingsGoalRepository } from "./infrastructure/prisma-savings-goal.repository";

/**
 * Leaf data module for the `savings-goal` table — the aggregate's own
 * port→adapter binding, no orchestration. Needed now that closing/reopening a
 * goal composes `bank-account`/`transaction` for real money movement
 * (research.md §7 of specs/018): those domains' handlers never import
 * `SavingsGoalModule` (which would pull in its controller/handlers too), only
 * this leaf — same split `bank-account`/`installment-plan` already use.
 */
@Module({
  providers: [
    { provide: SAVINGS_GOAL_REPOSITORY, useClass: PrismaSavingsGoalRepository },
    {
      provide: SAVINGS_GOAL_CURRENCY_USAGE,
      useClass: PrismaSavingsGoalCurrencyUsageLookupRepository,
    },
  ],
  exports: [SAVINGS_GOAL_REPOSITORY, SAVINGS_GOAL_CURRENCY_USAGE],
})
export class SavingsGoalDataModule {}
