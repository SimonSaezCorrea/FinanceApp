import type { Debt, PlannedDebt } from "../debt.aggregate";

export const DEBT_REPOSITORY = Symbol("DEBT_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface DebtRepositoryPort {
  list(userId: string): Promise<Debt[]>;
  findOne(userId: string, id: string): Promise<Debt | null>;
  create(userId: string, plan: PlannedDebt): Promise<Debt>;
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
}
