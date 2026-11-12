/**
 * `session` table — one login (specs/023). Its own `id` travels as the `sid` claim
 * inside both tokens (access + refresh) that login issued: `closedAt === null` IS the
 * session's aliveness, checked on every guarded request/refresh. Not an aggregate
 * root: always written through the `user` domain's session-issuing/closing commands,
 * never independently. This domain owns the table's shape and persistence, never the
 * token/JWT rules.
 *
 * Amendment (2026-09-19): closing a session (explicit close/logout/revoke-others, or a
 * daily sweep noticing `expiresAt` passed) stamps `closedAt` instead of deleting — the
 * row stays visible, marked closed, for `SESSION_CLOSED_RETENTION_DAYS` before the same
 * cron purges it for real. Supersedes the original "real DELETE, no history" design.
 */
export const SESSION_CLOSED_RETENTION_DAYS = 3;

/** A session slides with every refresh, but never past this many days after it was opened
 * (security run-3): a stolen refresh token kept in use can't keep a session alive forever. */
export const SESSION_MAX_AGE_DAYS = 30;

/** How long the refresh token rotated away stays acceptable: two tabs of one browser refreshing
 * at the same moment both present it (security run-3). */
export const REFRESH_REUSE_GRACE_SECONDS = 30;

/** What presenting a refresh token did to its session (see `rotateRefresh`). */
export type RefreshRotation = "ROTATED" | "REUSED" | "GONE";

export interface SessionProps {
  id: string;
  userId: string;
  deviceLabel: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** `null` = open. Set once, never cleared — a closed session is never reopened. */
  closedAt: string | null;
}

/** A row about to be inserted — `id` is minted by the caller (it must match the `sid`
 * already embedded in the tokens just issued), so unlike most `*Plan` types this one
 * DOES carry `id` up front rather than leaving it to Prisma's own default. Always
 * created open (`closedAt` isn't part of the plan — Prisma's own default is `null`). */
export type SessionPlan = Omit<SessionProps, "createdAt" | "lastUsedAt" | "closedAt"> & {
  /** The passkey this login used (specs/041), so its sessions close if it turns compromised. */
  passkeyId?: string | null;
  /** The jti of the refresh token issued with the session (security run-3). */
  refreshJti?: string | null;
};
