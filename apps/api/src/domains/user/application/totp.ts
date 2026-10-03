import * as OTPAuth from "otpauth";

/** Consecutive invalid codes before the TOTP lockout kicks in, and how long it lasts — shared by
 * login's second factor and the step-up before closing sessions, so a guesser can't get more
 * attempts by switching between the two. */
export const MFA_LOCKOUT_THRESHOLD = 5;
export const MFA_LOCKOUT_MINUTES = 15;

/** Whether a 6-digit code is valid for this (decrypted) TOTP secret, allowing ±1 period of drift. */
export function isValidTotp(secret: string | null, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret ?? ""),
  });
  return totp.validate({ token: code, window: 1 }) !== null;
}
