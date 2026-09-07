import type { PlannedSavingsEntry, SavingsEntry } from "../savings-entry.aggregate";

export const SAVINGS_ENTRY_REPOSITORY = Symbol("SAVINGS_ENTRY_REPOSITORY");

/** Per-goal aggregates used to derive `SavingsGoal.savedAmount`/`pace` — see
 * research.md §4. `lastThreeMonthsTotal` sums only aportes whose
 * `contributedAt` falls in the last 3 complete calendar months (or since
 * `goalCreatedAt` if that's more recent), which is what the pace average
 * divides by the elapsed month count. */
export interface SavingsGoalEntrySums {
  total: string;
  lastThreeMonthsTotal: string;
}

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface SavingsEntryRepositoryPort {
  list(userId: string): Promise<SavingsEntry[]>;
  /** Scoped by `userId` — a foreign id resolves to `null`, never to another
   * user's row (Principle VIII: an identifier is not authorization). */
  findOne(userId: string, id: string): Promise<SavingsEntry | null>;
  create(userId: string, plan: PlannedSavingsEntry): Promise<SavingsEntry>;
  /** Same write, enlisted in the caller's transaction (idempotency's COMPLETED
   * mark must commit with the effect). */
  createWithTx(tx: unknown, userId: string, plan: PlannedSavingsEntry): Promise<SavingsEntry>;
  save(aggregate: SavingsEntry): Promise<void>;
  saveWithTx(tx: unknown, aggregate: SavingsEntry): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  removeWithTx(tx: unknown, userId: string, id: string): Promise<boolean>;
  /** How many aportes a goal has — what `SavingsGoal.applyUpdate`'s currency
   * lock needs (a table `savings-goal` itself can't see). */
  countByGoal(userId: string, goalId: string): Promise<number>;
  /** Bulk `savingsGoalId` reassignment for a "pasar a ahorro libre"
   * (`toGoalId: null`) or "traspasar a otra meta" close — enlisted in the
   * caller's transaction. */
  reassignGoalWithTx(
    tx: unknown,
    userId: string,
    fromGoalId: string,
    toGoalId: string | null,
  ): Promise<void>;
  /** Aggregates for `savedAmount`/`pace`, one query per goal id given (never
   * N+1 — the caller passes every goal id it needs at once). */
  sumsByGoal(
    userId: string,
    goalIds: string[],
    since: Date,
  ): Promise<Map<string, SavingsGoalEntrySums>>;
  /** Σ every aporte with no goal (ahorro libre) — for `GET /savings/summary`. */
  freeSavingsTotal(userId: string): Promise<string>;
}
