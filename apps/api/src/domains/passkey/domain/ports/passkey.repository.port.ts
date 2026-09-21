import type { PasskeyPlan, PasskeyProps } from "../passkey.entity";

export const PASSKEY_REPOSITORY = Symbol("PASSKEY_REPOSITORY");

/** Port for the `passkey` table only (Adapter, Constitution VI). Named operations, not generic
 * CRUD: a passkey is always addressed through the user it belongs to. */
export interface PasskeyRepositoryPort {
  createWithTx(tx: unknown, plan: PasskeyPlan): Promise<PasskeyProps>;
  findByUserId(userId: string): Promise<PasskeyProps[]>;
  /** Scoped to no user — the login flow resolves a credential by its own id, then checks which
   * user it belongs to. */
  findByCredentialId(credentialId: string): Promise<PasskeyProps | null>;
  /** Ownership-scoped lookup for the management endpoints (delete). */
  findByIdOwned(userId: string, id: string): Promise<PasskeyProps | null>;
  /** Changes `name`, ownership-scoped in one statement (specs/025) — `null` if the row doesn't
   * exist or doesn't belong to `userId`, same contract as `findByIdOwned`. */
  renameOwned(userId: string, id: string, name: string): Promise<PasskeyProps | null>;
  updateCounterAndLastUsedWithTx(
    tx: unknown,
    id: string,
    counter: number,
    lastUsedAt: Date,
  ): Promise<void>;
  /** Returns whether a row was actually deleted (ownership-scoped). */
  deleteOwned(userId: string, id: string): Promise<boolean>;
  /** Hard-deletes every passkey of a user — used only by account deletion, where the
   * credential itself must stop being a way back in. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
