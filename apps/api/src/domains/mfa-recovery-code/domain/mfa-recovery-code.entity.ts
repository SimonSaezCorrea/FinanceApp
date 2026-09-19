/**
 * `mfa-recovery-code` table — one single-use recovery code issued when a user confirms MFA
 * activation (specs/021). Not an aggregate root: it only ever exists under a `User`, and is
 * always written through the `user` domain's MFA commands, never independently. This domain
 * owns the table's shape and persistence, never the rules about when a code may be created or
 * consumed.
 */
export interface MfaRecoveryCodeProps {
  id: string;
  userId: string;
  /** bcrypt hash of the "XXXX-XXXX" code — never the plaintext. */
  codeHash: string;
  /** null = still usable. */
  usedAt: string | null;
  createdAt: string;
}
