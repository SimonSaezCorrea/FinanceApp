import { compare } from "bcryptjs";

import type { PrismaService } from "../../../infra/prisma/prisma.service";
import { InvalidCurrentPasswordError, LoginLockedError, UnauthorizedError } from "../domain/errors";
import type { UserRepositoryPort } from "../domain/ports/user.repository.port";
import { LOGIN_LOCKOUT_MINUTES, LOGIN_LOCKOUT_THRESHOLD } from "./login-lockout";

type Outcome = "ok" | "invalid" | "locked" | "unauthorized";

/**
 * Re-entering the password from inside a session (step-up by password, change password, disable
 * MFA, delete the account) counts like a login attempt (security run-3): before, each of these
 * compared the password with no limit, so whoever held a stolen session could guess the password
 * as fast as bcrypt allowed and, once right, pass the step-up that protects changing the email.
 *
 * It shares LOGIN's counter and lockout on purpose — one rule for "too many guesses", and
 * switching between login and these routes never buys more attempts. While locked even the right
 * password is refused (`LOGIN_LOCKED`, 429), exactly as login does.
 *
 * Same shape as `LoginHandler`: bcrypt runs BEFORE the transaction on the hash read without a
 * lock (computing it with the row locked held a pooled connection per guess); inside one
 * transaction with the row locked only the outcome is recorded. The transaction returns an
 * outcome instead of throwing, since throwing would roll back the failure count; the error is
 * raised after the commit.
 *
 * Returns the hash that was verified, so a caller writing later can refuse when the password
 * changed in between.
 */
export async function verifyPasswordCounted(
  deps: { prisma: PrismaService; users: UserRepositoryPort },
  userId: string,
  password: string,
): Promise<string> {
  const user = await deps.users.findById(userId);
  if (!user) throw new UnauthorizedError();
  if (!user.passwordHash) throw new InvalidCurrentPasswordError();
  if (user.isLoginLocked(new Date())) throw new LoginLockedError();

  const checkedHash = user.passwordHash;
  const matches = await compare(password, checkedHash);
  const outcome = await deps.prisma.$transaction(async (tx): Promise<Outcome> => {
    const locked = await deps.users.findByIdForUpdateWithTx(tx, userId);
    if (!locked) return "unauthorized";
    const now = new Date();
    if (locked.isLoginLocked(now)) return "locked";
    // The password changed between the read and the lock: what was checked is no longer it.
    if (locked.passwordHash !== checkedHash) return "invalid";
    if (!matches) {
      locked.recordLoginFailure(LOGIN_LOCKOUT_THRESHOLD, LOGIN_LOCKOUT_MINUTES, now);
      await deps.users.saveWithTx(tx, locked);
      return locked.isLoginLocked(now) ? "locked" : "invalid";
    }
    if (locked.recordLoginSuccess()) await deps.users.saveWithTx(tx, locked);
    return "ok";
  });

  if (outcome === "unauthorized") throw new UnauthorizedError();
  if (outcome === "locked") throw new LoginLockedError();
  if (outcome === "invalid") throw new InvalidCurrentPasswordError();
  return checkedHash;
}
