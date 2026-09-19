export const MFA_RECOVERY_CODE_REPOSITORY = Symbol("MFA_RECOVERY_CODE_REPOSITORY");

/**
 * Port for the `mfa-recovery-code` table only (Adapter, Constitution VI). Named operations, not
 * generic CRUD: recovery codes are always addressed through the user they belong to.
 */
export interface MfaRecoveryCodeRepositoryPort {
  /** Inserts a fresh set of codes (already bcrypt-hashed) inside the caller's transaction. */
  createManyWithTx(tx: unknown, userId: string, codeHashes: string[]): Promise<void>;
  /** How many of the user's codes are still unused — the FR-015 "how many do I have left" count. */
  countUnused(userId: string): Promise<number>;
  /** Every unused code's id + hash, for the login-time bcrypt comparison loop. */
  findUnusedByUser(userId: string): Promise<{ id: string; codeHash: string }[]>;
  /**
   * Atomically marks one code used — `UPDATE ... WHERE id = ? AND usedAt IS NULL`. Returns
   * `false` if it was already used (a concurrent request won the race, or a replay attempt),
   * which the caller must treat exactly like an invalid code.
   */
  markUsedWithTx(tx: unknown, id: string): Promise<boolean>;
  /** Deactivating MFA discards every code — a reactivation always starts from a fresh set. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
