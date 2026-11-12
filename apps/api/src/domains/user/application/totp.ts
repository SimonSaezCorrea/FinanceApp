import * as OTPAuth from "otpauth";

/** Consecutive invalid codes before the TOTP lockout kicks in, and how long it lasts — shared by
 * login's second factor and the step-up before closing sessions, so a guesser can't get more
 * attempts by switching between the two. */
export const MFA_LOCKOUT_THRESHOLD = 5;
export const MFA_LOCKOUT_MINUTES = 15;

const PERIOD_SECONDS = 30;

/** The 30-second step a 6-digit code is valid for with this (decrypted) TOTP secret, allowing ±1
 * period of drift; null when it isn't valid (or there is no secret). Callers pass the step to
 * `User.useTotpStep`, which refuses a step already used (security run-3: no replay). */
export function totpStepFor(
  secret: string | null,
  code: string,
  now: number = Date.now(),
): number | null {
  if (!secret) return null;
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1, timestamp: now });
  return delta === null ? null : Math.floor(now / 1000 / PERIOD_SECONDS) + delta;
}
