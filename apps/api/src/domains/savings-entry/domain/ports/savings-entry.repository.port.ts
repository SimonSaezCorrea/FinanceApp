import type { PlannedSavingsEntry, SavingsEntry } from "../savings-entry.aggregate";

export const SAVINGS_ENTRY_REPOSITORY = Symbol("SAVINGS_ENTRY_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface SavingsEntryRepositoryPort {
  list(userId: string): Promise<SavingsEntry[]>;
  create(userId: string, plan: PlannedSavingsEntry): Promise<SavingsEntry>;
}
