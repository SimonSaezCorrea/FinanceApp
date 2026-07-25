import type { PlannedImportRow } from "../import-batch";

export const IMPORT_TRANSACTIONS_REPOSITORY = Symbol("IMPORT_TRANSACTIONS_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface ImportTransactionsRepositoryPort {
  /** Bulk-inserts every planned row for `userId`, returning the count
   * actually inserted. */
  importRows(userId: string, rows: PlannedImportRow[]): Promise<number>;
}
