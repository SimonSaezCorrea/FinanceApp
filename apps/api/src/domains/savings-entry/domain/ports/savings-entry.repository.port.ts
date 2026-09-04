import type { PlannedSavingsEntry, SavingsEntry } from "../savings-entry.aggregate";

export const SAVINGS_ENTRY_REPOSITORY = Symbol("SAVINGS_ENTRY_REPOSITORY");

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
  remove(userId: string, id: string): Promise<boolean>;
}
