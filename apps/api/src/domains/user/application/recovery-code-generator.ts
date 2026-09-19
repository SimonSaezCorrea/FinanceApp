import { randomInt } from "node:crypto";

const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I — visually ambiguous characters a user might mistranscribe.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Generates a fresh set of `XXXX-XXXX` single-use recovery codes (specs/021 R4). */
export function generateRecoveryCodes(): string[] {
  return Array.from(
    { length: RECOVERY_CODE_COUNT },
    () => `${randomSegment(4)}-${randomSegment(4)}`,
  );
}

/** Loose format check — `XXXX-XXXX`, 9 chars with one hyphen — used to tell a recovery code
 * apart from a 6-digit TOTP code before doing any bcrypt comparison (FR-007). */
export function looksLikeRecoveryCode(code: string): boolean {
  return /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(code.trim());
}
