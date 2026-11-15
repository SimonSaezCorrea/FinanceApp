import { compare } from "bcryptjs";

import { InvalidCurrentPasswordError, LoginLockedError, UnauthorizedError } from "../domain/errors";
import type { UserRepositoryPort } from "../domain/ports/user.repository.port";
import { sessionPasswordFailures } from "./failure-counter";
import { serially } from "./per-key-queue";

/**
 * Re-entering the password from inside a session (step-up by password, change password, disable
 * MFA, delete the account) is limited (security run-3): before, each of these compared the
 * password with no limit, so whoever held a stolen session could guess it as fast as bcrypt
 * allowed and, once right, pass the step-up that protects changing the email.
 *
 * It has its OWN count per user (`sessionPasswordFailures`: `LOGIN_LOCKOUT_THRESHOLD` wrong
 * answers lock these checks for `LOGIN_LOCKOUT_MINUTES`, the right password included). It used to
 * share login's lockout, which let anyone who knows the RUT keep a signed-in owner from changing
 * the password or turning off the second factor (run-3): a session is not the anonymous guesser.
 * The routes also carry the per-user `sessionPassword` request limit.
 *
 * Returns the hash that was verified, so a caller writing later can refuse when the password
 * changed in between.
 */
export function verifyPasswordCounted(
  deps: { users: UserRepositoryPort },
  userId: string,
  password: string,
): Promise<string> {
  // One check per account at a time, so a burst can't all pass "locked?" before any failure is
  // counted (security run-4 hardening).
  return serially(`session-password:${userId}`, () => check(deps, userId, password));
}

async function check(
  deps: { users: UserRepositoryPort },
  userId: string,
  password: string,
): Promise<string> {
  const user = await deps.users.findById(userId);
  if (!user) throw new UnauthorizedError();
  if (!user.passwordHash) throw new InvalidCurrentPasswordError();
  if (sessionPasswordFailures.isLocked(userId)) throw new LoginLockedError();

  const checkedHash = user.passwordHash;
  if (!(await compare(password, checkedHash))) {
    if (sessionPasswordFailures.recordFailure(userId)) throw new LoginLockedError();
    throw new InvalidCurrentPasswordError();
  }
  sessionPasswordFailures.reset(userId);
  return checkedHash;
}
