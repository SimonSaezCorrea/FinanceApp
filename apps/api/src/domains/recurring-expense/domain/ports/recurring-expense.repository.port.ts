import type { PlannedRecurringExpense, RecurringExpense } from "../recurring-expense.aggregate";

export const RECURRING_EXPENSE_REPOSITORY = Symbol("RECURRING_EXPENSE_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface RecurringExpenseRepositoryPort {
  list(userId: string): Promise<RecurringExpense[]>;
  findOne(userId: string, id: string): Promise<RecurringExpense | null>;
  create(userId: string, plan: PlannedRecurringExpense): Promise<RecurringExpense>;
  /** Same insert, enlisted in the caller's transaction. */
  createWithTx(
    tx: unknown,
    userId: string,
    plan: PlannedRecurringExpense,
  ): Promise<RecurringExpense>;
  save(aggregate: RecurringExpense): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  /** Series charged to `accountId` or to one of `cardIds`. */
  listIdsForAccount(userId: string, accountId: string, cardIds: string[]): Promise<string[]>;
  removeManyWithTx(tx: unknown, userId: string, ids: string[]): Promise<void>;
  /** How many rows of this table the user has: what replacing everything from a
   * template (specs/027, REPLACE) would delete, shown before confirming. */
  countForUser(userId: string): Promise<number>;
  /** Deletes every row of this table the user owns, inside the caller's
   * transaction: replacing everything from a template rebuilds them from the file. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
