/**
 * `consent-record` table — one row per explicit, versioned consent a user granted (Ley 21.719
 * Art. 16: sensitive-data processing needs its own reinforced consent, separate from any
 * bundled "I accept the terms" checkbox). Not an aggregate root: it only ever exists under a
 * `User`, written through `user`'s own commands (registration today), never independently.
 */
export type ConsentType = "SENSITIVE_DATA_PROCESSING";

export interface ConsentRecordProps {
  id: string;
  userId: string;
  type: ConsentType;
  /** A server-defined identifier for whatever text was shown at the moment of consent (e.g. a
   * date string) — never client-supplied, so it can't be spoofed to claim a different version
   * was accepted. */
  policyVersion: string;
  grantedAt: string;
  /** Null while still in effect — a user can withdraw one consent without touching any other. */
  revokedAt: string | null;
}
