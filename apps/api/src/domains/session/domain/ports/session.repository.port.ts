import type { SessionPlan, SessionProps } from "../session.entity";

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");

/** Port for the `session` table only (Adapter, Constitution VI). Named operations, not
 * generic CRUD: a session is always addressed either by its own id (the `sid` claim, no
 * user context available yet — e.g. refresh) or scoped to its owner (the management
 * endpoints). No `*WithTx` variants: unlike a movement or a statement payment, issuing a
 * session never needs to commit atomically alongside another table's write — the tokens
 * themselves are never persisted, only this row is. */
export interface SessionRepositoryPort {
  create(plan: SessionPlan): Promise<SessionProps>;
  /** Every session of a user not yet purged (open OR recently closed, within the
   * retention window) — most recently active first. The UI shows closed ones too,
   * marked as such (`closedAt`). */
  listByUser(userId: string): Promise<SessionProps[]>;
  /** Bumps `lastUsedAt`/`expiresAt` on a refresh (FR-009) — only touches a row that's
   * still OPEN and unexpired; `null` otherwise (closed, purged, or its `expiresAt`
   * already passed), which the caller treats as an invalid refresh token, never a
   * silent no-op or a way to resurrect a closed session. */
  touch(id: string, lastUsedAt: Date, expiresAt: Date): Promise<SessionProps | null>;
  /** Idempotently stamps `closedAt` on a session owned by this user, if it isn't
   * already closed — a repeat close is a harmless no-op, never re-stamps (which would
   * incorrectly push out its purge date). Ownership-scoped, but does NOT report
   * whether the id existed at all — pair with `existsForUser` for that (the 404 case in
   * `CloseSessionHandler`). */
  closeOwned(userId: string, id: string): Promise<void>;
  /** Whether a session exists for this user at all (open or closed) — used to tell a
   * foreign/nonexistent id (404 `SESSION_NOT_FOUND`) apart from an already-closed one
   * (204 no-op) in `CloseSessionHandler`, without needing the full row. */
  existsForUser(userId: string, id: string): Promise<boolean>;
  /** "Cerrar todas las demás" — stamps `closedAt` on every OPEN session of a user
   * except one; returns how many were closed. */
  closeAllExceptForUser(userId: string, exceptId: string): Promise<number>;
  /** Best-effort close by id alone (no ownership check — used by `logout`, which
   * already trusts a cryptographically-verified refresh token for the id/user pairing
   * and must never fail just because there was nothing left to close). */
  closeById(id: string): Promise<void>;
  /** Daily cron, phase 1 ("detect"): stamps `closedAt` on every OPEN session whose
   * `expiresAt` has already passed — returns how many were marked. */
  markExpiredAsClosed(now: Date): Promise<number>;
  /** Daily cron, phase 2 ("purge"): deletes every session closed before the given
   * instant (i.e. `closedAt <= now - SESSION_CLOSED_RETENTION_DAYS`) — returns how many
   * were removed. */
  purgeClosedBefore(cutoff: Date): Promise<number>;
}
