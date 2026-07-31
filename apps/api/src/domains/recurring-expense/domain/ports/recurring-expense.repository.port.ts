import type { PlannedRecurringExpense, RecurringExpense } from "../recurring-expense.aggregate";

export const RECURRING_EXPENSE_REPOSITORY = Symbol("RECURRING_EXPENSE_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface RecurringExpenseRepositoryPort {
  list(userId: string): Promise<RecurringExpense[]>;
  findOne(userId: string, id: string): Promise<RecurringExpense | null>;
  create(userId: string, plan: PlannedRecurringExpense): Promise<RecurringExpense>;
  save(aggregate: RecurringExpense): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}
