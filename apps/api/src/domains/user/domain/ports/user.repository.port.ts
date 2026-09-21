import type { User } from "../user.aggregate";

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(plan: {
    email: string;
    name?: string;
    passwordHash: string;
    birthDate: Date;
  }): Promise<User>;
  /** Persists every profile/preferences/security field this aggregate owns. */
  save(user: User): Promise<void>;
  /** Same as `save`, inside the caller's transaction — for the two MFA flows that must save
   * `User` atomically alongside `MfaRecoveryCode` rows (confirm enrollment, disable). */
  saveWithTx(tx: unknown, user: User): Promise<void>;
  /** `SELECT ... FOR UPDATE` inside the caller's transaction — a second concurrent call for the
   * SAME id blocks until the first transaction commits, instead of both reading the
   * pre-mutation row and one silently clobbering the other's write. What actually closes the
   * `mfaFailedAttempts += 1` race under concurrent invalid MFA attempts (specs/021, mirrors
   * `debt`'s own `findOneForUpdateWithTx`). */
  findByIdForUpdateWithTx(tx: unknown, id: string): Promise<User | null>;
  /** A linked country's display name (mirrors `accounts`' `institutionName` lookup). */
  countryName(id: string): Promise<string | null>;
  /** Hard-deletes the row itself — every other table's `onDelete: Cascade` on its `userId` FK
   * does the rest. Used only by account deletion when the user opted OUT of keeping their
   * history (`keepHistory: false`); the `keepHistory: true` path never calls this, it calls
   * `saveWithTx` with an already-scrubbed `User` instead. */
  deleteWithTx(tx: unknown, id: string): Promise<void>;
}
