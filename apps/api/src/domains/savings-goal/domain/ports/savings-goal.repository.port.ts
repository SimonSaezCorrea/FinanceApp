import type { PlannedSavingsGoal, SavingsGoal } from "../savings-goal.aggregate";

export const SAVINGS_GOAL_REPOSITORY = Symbol("SAVINGS_GOAL_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface SavingsGoalRepositoryPort {
  list(userId: string): Promise<SavingsGoal[]>;
  findOne(userId: string, id: string): Promise<SavingsGoal | null>;
  create(userId: string, plan: PlannedSavingsGoal): Promise<SavingsGoal>;
  save(aggregate: SavingsGoal): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}
