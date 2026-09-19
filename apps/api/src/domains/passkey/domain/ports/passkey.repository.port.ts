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
  updateCounterAndLastUsedWithTx(
    tx: unknown,
    id: string,
    counter: number,
    lastUsedAt: Date,
  ): Promise<void>;
  /** Returns whether a row was actually deleted (ownership-scoped). */
  deleteOwned(userId: string, id: string): Promise<boolean>;
}
