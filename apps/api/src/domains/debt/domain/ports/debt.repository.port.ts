import type { Debt, PlannedDebt } from "../debt.aggregate";

export const DEBT_REPOSITORY = Symbol("DEBT_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface DebtRepositoryPort {
  list(userId: string): Promise<Debt[]>;
  findOne(userId: string, id: string): Promise<Debt | null>;
  create(userId: string, plan: PlannedDebt): Promise<Debt>;
  /** Same insert, enlisted in the caller's transaction. */
  createWithTx(tx: unknown, userId: string, plan: PlannedDebt): Promise<Debt>;
  save(aggregate: Debt): Promise<void>;
  /** Same write, enlisted in the caller's transaction — so the debt's new state
   * and the idempotency record's COMPLETED mark commit together. */
  saveWithTx(tx: unknown, aggregate: Debt): Promise<void>;
  /**
   * Reads the row `FOR UPDATE`, inside the caller's transaction, so a
   * concurrent `register-payment`/`undo-payment`/`settle`/`unsettle` on the
   * SAME debt blocks until this one commits instead of racing it — the read
   * genuinely has to happen inside the same critical section as the write, or
   * two concurrent callers both read the pre-mutation state and one's write
   * silently overwrites the other's (a lost update, not merely a duplicate).
   * `saveWithTx` alone does NOT close this: it only makes the WRITE atomic
   * with the idempotency mark, not the read-modify-write as a whole.
   */
  findOneForUpdateWithTx(tx: unknown, userId: string, id: string): Promise<Debt | null>;
  remove(userId: string, id: string): Promise<boolean>;
  /** Debts that name `accountId` — as their payment account or as where their
   * last payment moved. They are never deleted with the account, only unlinked. */
  countForAccount(userId: string, accountId: string): Promise<number>;
  /** Forget a last payment recorded on `accountId` (being deleted): undoing it can
   * no longer reverse a movement or a balance that won't exist, so undo only moves
   * the counter back, same as a payment recorded before those columns existed. */
  clearLastPaymentForAccountWithTx(tx: unknown, userId: string, accountId: string): Promise<void>;
  /** How many rows of this table the user has: what replacing everything from a
   * template (specs/027, REPLACE) would delete, shown before confirming. */
  countForUser(userId: string): Promise<number>;
  /** Deletes every row of this table the user owns, inside the caller's
   * transaction: replacing everything from a template rebuilds them from the file. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
