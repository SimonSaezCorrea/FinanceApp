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
}

/** A row about to be inserted (no id/createdAt yet — Prisma's own defaults). */
export type PasskeyPlan = Omit<PasskeyProps, "id" | "createdAt" | "lastUsedAt">;
