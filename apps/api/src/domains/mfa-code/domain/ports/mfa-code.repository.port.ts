import type { MfaCodePlan, MfaCodeProps, MfaCodePurpose } from "../mfa-code";

export const MFA_CODE_REPOSITORY = Symbol("MFA_CODE_REPOSITORY");

/** Port for the `mfa-code` table only (Adapter, Constitution VI). */
export interface MfaCodeRepositoryPort {
  /** In its own transaction: marks the active code of the purpose used, then inserts this one.
   * A concurrent issue that won the partial unique index makes this one `{ issued: false }`. */
  issue(plan: MfaCodePlan): Promise<{ issued: boolean }>;
  /** When each code of the purpose was issued since `since` (the resend limits). */
  issuedSince(userId: string, purpose: MfaCodePurpose, since: Date): Promise<Date[]>;
  /** The active, unexpired code of the purpose. */
  findActive(userId: string, purpose: MfaCodePurpose, now: Date): Promise<MfaCodeProps | null>;
  /** Marks it used if it is still active and unexpired; false when someone else got there first. */
  consumeWithTx(tx: unknown, id: string, now: Date): Promise<boolean>;
  /** Voids the active code of the purpose (e.g. the setup it was for was replaced). */
  revokeActiveWithTx(
    tx: unknown,
    userId: string,
    purpose: MfaCodePurpose,
    now: Date,
  ): Promise<void>;
  /** Maintenance: deletes codes used or expired before `before`. */
  purgeStale(before: Date): Promise<number>;
}
