import { createHash, randomBytes } from "node:crypto";

/**
 * `email-token` table — a single-use link sent by email (specs/032): confirm an address or reset
 * the password. Only the SHA-256 of the token is stored; the token itself exists only inside the
 * link. 256 bits of entropy make a fast hash enough (it isn't a guessable password) and let the
 * lookup be an indexed equality.
 */
export type EmailTokenPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

export interface EmailTokenProps {
  id: string;
  userId: string;
  purpose: EmailTokenPurpose;
  userEmailId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** What `issue()` inserts. */
export interface EmailTokenPlan {
  userId: string;
  purpose: EmailTokenPurpose;
  userEmailId: string | null;
  tokenHash: string;
  expiresAt: Date;
}

/** Lifetimes decided in clarify (spec 032): a verification link 48 h, a reset link 30 min. */
export const TOKEN_LIFETIME_MS: Record<EmailTokenPurpose, number> = {
  VERIFY_EMAIL: 48 * 60 * 60 * 1000,
  RESET_PASSWORD: 30 * 60 * 1000,
};

/** FR-024: at most this many links per account and purpose in the last hour. */
export const MAX_TOKENS_PER_HOUR = 5;
/** A second request within this window reuses the link just sent instead of sending another —
 * a shortcut in front of the partial unique index, which is the actual guarantee. */
export const RESEND_WINDOW_MS = 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh link token (32 random bytes, base64url, 43 chars) and the hash that gets stored. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function expiresAtFor(purpose: EmailTokenPurpose, now: Date): Date {
  return new Date(now.getTime() + TOKEN_LIFETIME_MS[purpose]);
}

/** Whether a link sent this recently should be reused rather than replaced by a new email. */
export function isWithinResendWindow(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < RESEND_WINDOW_MS;
}

export function oneHourBefore(now: Date): Date {
  return new Date(now.getTime() - 60 * 60 * 1000);
}
