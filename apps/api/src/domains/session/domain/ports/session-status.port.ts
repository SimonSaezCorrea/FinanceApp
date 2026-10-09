export const SESSION_STATUS = Symbol("SESSION_STATUS");

/**
 * Narrow port answering "is this session still alive?" for `GET /auth/session` (spec 031) — the
 * same rule `JwtAuthGuard` applies (open, not past `expiresAt`, owner not disabled), as a yes/no
 * instead of a 401. Implemented by the same `PrismaSessionRepository`, bound to a third token
 * (same shape as `SessionStepUpPort`).
 */
export interface SessionStatusPort {
  /** Whether this user's session is open, unexpired at `now`, and its owner is active. */
  isAlive(userId: string, sessionId: string, now: Date): Promise<boolean>;
}
