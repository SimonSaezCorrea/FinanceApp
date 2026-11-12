/** The sensitive changes that send a security notice (specs/032 FR-021). Same literals as the
 * notice template's kinds. */
export type AccountSecurityKind =
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "PASSKEY_ADDED"
  | "PASSKEY_REMOVED"
  | "EMAIL_CHANGED"
  | "EMAIL_CHANGE_REQUESTED"
  | "IDENTIFIER_CHANGED"
  | "ACCOUNT_DELETED"
  | "RECOVERY_CODES_REGENERATED"
  | "TRUSTED_DEVICE_ADDED"
  | "MFA_METHOD_CHANGED"
  | "PASSKEY_COMPROMISED";

/**
 * Something sensitive changed on an account (specs/032 US3). Published by the handlers AFTER
 * their transaction commits; `SendSecurityNoticeListener` turns it into a notice email. Adding a
 * new notice is adding a `kind`, without touching the publishers' flow.
 *
 * `recipient` is set when the account's own primary address can't be read at notice time: the
 * old address of an email change, or the address of a deleted account. It carries its
 * confirmation state so the listener applies the "confirmed addresses only" rule (FR-023).
 */
export class AccountSecurityEvent {
  constructor(
    public readonly userId: string,
    public readonly kind: AccountSecurityKind,
    public readonly occurredAt: Date,
    public readonly detail?: string,
    public readonly recipient?: { address: string; locale: string; verified: boolean },
    /** The verified authenticator model of a passkey (specs/041), named in PASSKEY_ADDED. */
    public readonly model?: string,
  ) {}
}
