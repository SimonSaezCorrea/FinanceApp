import { LOGIN_LOCKOUT_MINUTES, LOGIN_LOCKOUT_THRESHOLD } from "./login-lockout";

/**
 * Consecutive failures per key, locking the key for a while once they reach a threshold — the same
 * rule as the account's login lockout, kept in this process's memory for two counts that must NOT
 * live on the account row (security run-3):
 *
 * - `loginDeviceFailures`: a browser that signed in before (`LoginDeviceToken`) counts only its
 *   own wrong passwords, so a third party can't lock it out.
 * - `sessionPasswordFailures`: re-entering the password from inside a session (step-up, change
 *   password, disable MFA, delete account). A signed-in owner is not the anonymous guesser, so the
 *   account-wide lock no longer refuses them; a stolen session still gets only
 *   `LOGIN_LOCKOUT_THRESHOLD` guesses per `LOGIN_LOCKOUT_MINUTES`.
 *
 * Lost on a restart and not shared during the minute of a deploy, like the request limits and the
 * one-time claims (accepted, docs/PENDING.md).
 */
export class FailureCounter {
  private readonly entries = new Map<string, { failures: number; lockedUntil: number }>();

  constructor(
    private readonly threshold: number,
    private readonly lockMinutes: number,
    private readonly maxEntries = 100_000,
  ) {}

  isLocked(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);
    return entry !== undefined && entry.lockedUntil > now;
  }

  /** Counts one failure; true when the key is now locked. A lock that ran out starts over. */
  recordFailure(key: string, now = Date.now()): boolean {
    let entry = this.entries.get(key);
    if (entry && entry.lockedUntil !== 0 && entry.lockedUntil <= now) entry = undefined;
    if (!entry) {
      this.makeRoom(now);
      entry = { failures: 0, lockedUntil: 0 };
      this.entries.set(key, entry);
    }
    entry.failures += 1;
    if (entry.failures >= this.threshold) {
      entry.lockedUntil = now + this.lockMinutes * 60 * 1000;
    }
    return entry.lockedUntil > now;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  private makeRoom(now: number): void {
    if (this.entries.size < this.maxEntries) return;
    // Drop what isn't holding anyone back first, then the oldest (Map keeps insertion order).
    for (const [key, entry] of this.entries) if (entry.lockedUntil <= now) this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }
}

export const loginDeviceFailures = new FailureCounter(
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_MINUTES,
);
export const sessionPasswordFailures = new FailureCounter(
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_MINUTES,
);

/** Wrong codes while confirming a second-factor setup, per account (security run-4). Kept apart
 * from the login MFA counter so a stolen session can't lock the owner's sign-in with it. */
export const mfaEnrollmentFailures = new FailureCounter(
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_MINUTES,
);

/** Wrong second-factor codes (TOTP or emailed) during a step-up, per account (security run-4
 * hardening): apart from login's MFA counter, which a stolen session could otherwise keep
 * re-locking. */
export const stepUpCodeFailures = new FailureCounter(
  LOGIN_LOCKOUT_THRESHOLD,
  LOGIN_LOCKOUT_MINUTES,
);

/** Tests only: start from empty counts. */
export function resetFailureCounters(): void {
  loginDeviceFailures.clear();
  sessionPasswordFailures.clear();
  mfaEnrollmentFailures.clear();
  stepUpCodeFailures.clear();
}
