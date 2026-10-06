/** Consecutive wrong passwords before login locks, and for how long. Same numbers as the second
 * factor's lockout (`totp.ts`) on purpose: one rule for "too many guesses" across the app. */
export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

/** A RUT for the logs: enough to correlate attempts, not enough to identify the person. */
export function maskRut(normalizedRut: string): string {
  return `…${normalizedRut.slice(-4)}`;
}
