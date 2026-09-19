import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypts a TOTP secret for storage. Stored format is `iv:authTag:ciphertext` (all hex) — the
 * authTag gives tamper-detection for free, so a corrupted/edited ciphertext fails to decrypt
 * instead of silently producing garbage that would then fail every TOTP validation forever.
 *
 * Encryption (not hashing) is required here — unlike a password, a TOTP code is validated by
 * recomputing the expected HOTP from the secret, so the plaintext must be recoverable.
 */
export function encryptMfaSecret(plainSecret: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptMfaSecret(encrypted: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed MFA secret ciphertext");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
