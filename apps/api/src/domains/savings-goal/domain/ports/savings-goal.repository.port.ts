import type { PlannedSavingsGoal, SavingsGoal } from "../savings-goal.aggregate";

export const SAVINGS_GOAL_REPOSITORY = Symbol("SAVINGS_GOAL_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface SavingsGoalRepositoryPort {
  list(userId: string): Promise<SavingsGoal[]>;
  findOne(userId: string, id: string): Promise<SavingsGoal | null>;
  create(userId: string, plan: PlannedSavingsGoal): Promise<SavingsGoal>;
  /** Same insert, enlisted in the caller's transaction. */
  createWithTx(tx: unknown, userId: string, plan: PlannedSavingsGoal): Promise<SavingsGoal>;
  save(aggregate: SavingsGoal): Promise<void>;
  /** Same write, enlisted in the caller's transaction — so the goal's new
   * state and the idempotency record's COMPLETED mark commit together. */
  saveWithTx(tx: unknown, aggregate: SavingsGoal): Promise<void>;
  /** Reads the row `FOR UPDATE`, inside the caller's transaction — same
   * reasoning as `DebtRepositoryPort.findOneForUpdateWithTx`: a concurrent
   * `close`/`reopen` on the SAME goal must block, not race. */
  findOneForUpdateWithTx(tx: unknown, userId: string, id: string): Promise<SavingsGoal | null>;
  remove(userId: string, id: string): Promise<boolean>;
  /** How many rows of this table the user has: what replacing everything from a
   * template (specs/027, REPLACE) would delete, shown before confirming. */
  countForUser(userId: string): Promise<number>;
  /** Deletes every row of this table the user owns, inside the caller's
   * transaction: replacing everything from a template rebuilds them from the file. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
