export const ACCOUNT_DELETION_LOG_REPOSITORY = Symbol("ACCOUNT_DELETION_LOG_REPOSITORY");

/** Port for the `account-deletion-log` table only (Adapter, Constitution VI) — a single
 * write-only operation. See the schema's own doc-comment for why this table has no FK to
 * `User` and never stores a raw identifier. */
export interface AccountDeletionLogRepositoryPort {
  createWithTx(tx: unknown, keepHistory: boolean, identifierHash: string | null): Promise<void>;
}
