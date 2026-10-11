import type { UserEmailProps } from "../user-email.entity";

export const USER_EMAIL_REPOSITORY = Symbol("USER_EMAIL_REPOSITORY");

/** Port for the `user-email` table only (Adapter, Constitution VI). Every read is scoped by the
 * owning user except `findById`, used to resolve the address a verification link points at. The
 * `User.email`/`User.emailVerified` mirrors are NOT written here — the `user` table has its own
 * adapter; callers save both in one transaction. */
export interface UserEmailRepositoryPort {
  listForUser(userId: string): Promise<UserEmailProps[]>;
  findPrimary(userId: string): Promise<UserEmailProps | null>;
  findPending(userId: string): Promise<UserEmailProps | null>;
  /** Ownership-scoped: null when the row doesn't exist or belongs to another user. */
  findOwned(userId: string, id: string): Promise<UserEmailProps | null>;
  findById(id: string): Promise<UserEmailProps | null>;
  /** Same, inside a transaction: what a verification link reads before acting on the row. */
  findByIdWithTx(tx: unknown, id: string): Promise<UserEmailProps | null>;
  /** The account's first address (registration). */
  createPrimaryWithTx(
    tx: unknown,
    userId: string,
    address: string,
    verifiedAt: Date | null,
  ): Promise<UserEmailProps>;
  /** Registers a requested change: a previous PENDING moves to history first (only one may
   * exist — partial unique index), then the new one is inserted as PENDING. */
  addPendingWithTx(
    tx: unknown,
    userId: string,
    address: string,
    now: Date,
  ): Promise<UserEmailProps>;
  /** Confirms the primary in place, only if it is still the unconfirmed primary. Returns
   * whether it did (false = it changed meanwhile: the caller rolls back). */
  markVerifiedWithTx(tx: unknown, id: string, at: Date): Promise<boolean>;
  /** Confirms a pending address: the current primary moves to history, then the pending one
   * becomes the confirmed primary (in that order, for the one-primary index) — only if it is
   * still PENDING. Returns whether it did (false = it was replaced or removed meanwhile: the
   * caller rolls back, which also restores the primary). */
  promotePendingWithTx(tx: unknown, userId: string, pendingId: string, at: Date): Promise<boolean>;
  /** Deletes a row that is not the primary; returns whether one was deleted. */
  removeOwned(userId: string, id: string): Promise<boolean>;
  /** Account deletion: every address of the account goes (they identify the person). */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
