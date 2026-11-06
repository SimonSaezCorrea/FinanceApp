/**
 * `passkey` table — one WebAuthn credential registered by a user on a specific device
 * (specs/022). Not an aggregate root: it only ever exists under a `User`, and is always written
 * through the `user` domain's passkey commands, never independently. This domain owns the
 * table's shape and persistence, never the WebAuthn verification rules.
 */
export interface PasskeyProps {
  id: string;
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
  /** specs/041 — only for a passkey whose attestation was verified against the FIDO catalog. */
  aaguid: string | null;
  authenticatorName: string | null;
  verifiedAt: string | null;
  /** When its model was declared compromised: it no longer signs in nor confirms identity. */
  compromisedAt: string | null;
  compromisedReason: string | null;
}

/** A row about to be inserted (no id/createdAt yet — Prisma's own defaults). The attestation
 * fields are set only for a verified registration. */
export type PasskeyPlan = Omit<
  PasskeyProps,
  | "id"
  | "createdAt"
  | "lastUsedAt"
  | "aaguid"
  | "authenticatorName"
  | "verifiedAt"
  | "compromisedAt"
  | "compromisedReason"
> & {
  aaguid?: string | null;
  authenticatorName?: string | null;
  verifiedAt?: Date | null;
};

/** A passkey that can still sign in and confirm identity. */
export function isPasskeyCompromised(passkey: Pick<PasskeyProps, "compromisedAt">): boolean {
  return passkey.compromisedAt !== null;
}

/** What the review marked: enough to notify the owner. */
export interface MarkedPasskey {
  id: string;
  userId: string;
  name: string;
}
