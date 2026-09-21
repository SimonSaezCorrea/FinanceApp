/**
 * `consent-record` table — one row per explicit, versioned consent a user granted (Ley 21.719
 * Art. 16: sensitive-data processing needs its own reinforced consent, separate from any
 * bundled "I accept the terms" checkbox). Not an aggregate root: it only ever exists under a
 * `User`, written through `user`'s own commands (registration today), never independently.
 */
export type ConsentType = "SENSITIVE_DATA_PROCESSING" | "MINOR_GUARDIAN_AUTHORIZATION";
export type GuardianRelationship = "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER";

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
  /** Only set on a `MINOR_GUARDIAN_AUTHORIZATION` row — a third party's (the guardian's) own
   * data, kept to the minimum: name/relationship in the clear for display, the identifier only
   * as an HMAC (`guardianIdentifierHash`, never the raw RUT/DNI — same mechanism/caveat as
   * `AccountDeletionLog.identifierHash`). */
  guardianName: string | null;
  guardianIdentifierHash: string | null;
  guardianRelationship: GuardianRelationship | null;
}

/** What a caller provides to create a `MINOR_GUARDIAN_AUTHORIZATION` row — the hash, never the
 * raw identifier (hashing happens one layer up, in the application layer, which owns the HMAC
 * secret; this domain/infra layer only ever sees the already-hashed value). */
export interface GuardianAuthorizationPlan {
  guardianName: string;
  guardianIdentifierHash: string;
  guardianRelationship: GuardianRelationship;
}
