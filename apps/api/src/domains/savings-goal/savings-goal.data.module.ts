import { Module } from "@nestjs/common";

import { SAVINGS_GOAL_REPOSITORY } from "./domain/ports/savings-goal.repository.port";
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
  providers: [{ provide: SAVINGS_GOAL_REPOSITORY, useClass: PrismaSavingsGoalRepository }],
  exports: [SAVINGS_GOAL_REPOSITORY],
})
export class SavingsGoalDataModule {}
