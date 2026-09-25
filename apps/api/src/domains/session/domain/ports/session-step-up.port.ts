export const SESSION_STEP_UP = Symbol("SESSION_STEP_UP");

/**
 * Narrow port for a session's step-up stamp (`session.stepUpAt`, 2026-09-25) — kept apart from
 * `SessionRepositoryPort` so the handlers that only issue/list/close sessions don't have to know
 * about it. Implemented by the same `PrismaSessionRepository`, bound to a second token (same
 * shape as `CreditStatementLookupPort`). Both methods are scoped to the session's owner.
 */
export interface SessionStepUpPort {
  /** Stamps `stepUpAt` on this user's OPEN session — a closed one is never stepped up. */
  markSteppedUp(userId: string, sessionId: string, at: Date): Promise<void>;
  /** When this user's session last stepped up; `null` if never (or not theirs). */
  steppedUpAt(userId: string, sessionId: string): Promise<Date | null>;
}
