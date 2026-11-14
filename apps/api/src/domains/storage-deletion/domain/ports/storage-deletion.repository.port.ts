export const STORAGE_DELETION_REPOSITORY = Symbol("STORAGE_DELETION_REPOSITORY");

/** A queued file: its object-storage key, and how many times deleting it failed. */
export interface PendingStorageDeletion {
  id: string;
  storageKey: string;
  attempts: number;
}

/**
 * The `storage-deletion` table (security run-3): files whose attachment row is gone, queued by a
 * database trigger on `transaction-attachment` deletes. Global, never per user — the rows carry no
 * owner and the queue is only read by the maintenance cron.
 */
export interface StorageDeletionRepositoryPort {
  /** The oldest queued files, at most `limit`. */
  listPending(limit: number): Promise<PendingStorageDeletion[]>;
  /** Forgets files whose object was deleted. */
  remove(ids: string[]): Promise<void>;
  /** Counts one more failed attempt on these, so they are retried on the next run. */
  recordFailure(ids: string[]): Promise<void>;
}
