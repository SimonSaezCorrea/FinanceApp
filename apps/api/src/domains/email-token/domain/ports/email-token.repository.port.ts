import type { EmailTokenPlan, EmailTokenProps, EmailTokenPurpose } from "../email-token";

export const EMAIL_TOKEN_REPOSITORY = Symbol("EMAIL_TOKEN_REPOSITORY");

/** Port for the `email-token` table only (Adapter, Constitution VI). */
export interface EmailTokenRepositoryPort {
  /**
   * Issues a link, in its OWN transaction: marks the account's unused token of the same purpose
   * as used, then inserts the new one. A concurrent issue for the same (user, purpose) collides
   * with the partial unique index and returns `{ issued: false }` — the caller treats that as
   * "a link was just sent" and sends no second email (Constitution VII, form b). Its own
   * transaction because a unique violation aborts the whole Postgres transaction it happens in.
   */
  issue(plan: EmailTokenPlan): Promise<{ issued: true; id: string } | { issued: false }>;
  /** How many links of a purpose this account got since `since` (FR-024 hourly cap). */
  countSince(userId: string, purpose: EmailTokenPurpose, since: Date): Promise<number>;
  /** The account's unused link of a purpose, if any (the 60 s resend window). */
  findActive(userId: string, purpose: EmailTokenPurpose): Promise<EmailTokenProps | null>;
  /**
   * Consumes a link atomically: `UPDATE … SET usedAt = now WHERE tokenHash = ? AND purpose = ?
   * AND usedAt IS NULL AND expiresAt > now`. Two simultaneous uses: exactly one gets the row,
   * the other `null` (as does an unknown, expired, used or replaced link).
   */
  consumeWithTx(
    tx: unknown,
    tokenHash: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<EmailTokenProps | null>;
  /** Marks the account's unused links of a purpose as used (e.g. after the password changed). */
  revokeActiveWithTx(
    tx: unknown,
    userId: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<void>;
  /** Account deletion. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
  /** Daily cleanup: deletes links that expired, or were used, before `before`. */
  purgeStale(before: Date): Promise<number>;
}
