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
export type SessionPlan = Omit<SessionProps, "createdAt" | "lastUsedAt" | "closedAt">;
