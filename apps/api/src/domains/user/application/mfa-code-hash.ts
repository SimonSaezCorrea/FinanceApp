import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * The HMAC key for second-factor codes (specs/040 research R8), derived from `MFA_ENCRYPTION_KEY`
 * so no new secret is needed. A 6-digit code has only 10⁶ values: an unkeyed hash (or bcrypt) of
 * it falls to an offline search in seconds if the database leaks; with a server key it doesn't.
 */
export function deriveMfaCodeKey(mfaEncryptionKey: string): Buffer {
  return Buffer.from(hkdfSync("sha256", mfaEncryptionKey, Buffer.alloc(0), "fik/mfa-code", 32));
}

/** `HMAC(key, "<id>:<code>")`, hex. The row's id in the message keeps two equal codes apart. */
export function hashMfaCode(key: Buffer, id: string, code: string): string {
  return createHmac("sha256", key).update(`${id}:${code}`).digest("hex");
}

/** Constant-time comparison of a typed code against the stored hash. */
export function verifyMfaCode(key: Buffer, id: string, code: string, codeHash: string): boolean {
  const expected = Buffer.from(hashMfaCode(key, id, code), "hex");
  const stored = Buffer.from(codeHash, "hex");
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}
