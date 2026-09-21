import type { SessionPlan, SessionProps } from "../session.entity";

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");

/** Port for the `session` table only (Adapter, Constitution VI). Named operations, not
 * generic CRUD: a session is always addressed either by its own id (the `sid` claim, no
 * user context available yet — e.g. refresh) or scoped to its owner (the management
 * endpoints). Issuing a session itself never needs `*WithTx` (the tokens themselves are
 * never persisted, only this row is) — but `closeAllExceptForUser` does (specs/024): a
 * password change or an MFA deactivation must revoke every other session INSIDE the same
 * transaction as the credential change itself, so a failure here rolls back the whole
 * thing rather than leaving a changed credential with a revocation that silently didn't
 * happen. */
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
  /** Transactional variant of `closeAllExceptForUser` (specs/024) — `tx` is typed
   * `unknown` and cast internally by the adapter, same convention as every other
   * `*WithTx` port in this repo (e.g. `UserRepositoryPort.saveWithTx`). Used by
   * `ChangePasswordHandler`/`DisableMfaHandler` so a failure here rolls back the
   * credential change too. */
  closeAllExceptForUserWithTx(tx: unknown, userId: string, exceptId: string): Promise<number>;
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
  /** Hard-deletes every session row of a user, open or closed — used only by account
   * deletion (specs pending), where the 3-day retention window is meaningless because the
   * account it would let back in no longer exists. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
