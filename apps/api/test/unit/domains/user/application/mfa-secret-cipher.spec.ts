import { describe, expect, it } from "vitest";

import {
  decryptMfaSecret,
  encryptMfaSecret,
} from "../../../../../src/domains/user/application/mfa-secret-cipher";

const KEY = "0".repeat(64); // 32 bytes hex

describe("mfa-secret-cipher", () => {
  it("round-trips a secret through encrypt then decrypt", () => {
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP", KEY);
    expect(decryptMfaSecret(encrypted, KEY)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptMfaSecret("SAMESECRET", KEY);
    const b = encryptMfaSecret("SAMESECRET", KEY);
    expect(a).not.toBe(b);
  });

  it("throws on a malformed ciphertext", () => {
    expect(() => decryptMfaSecret("not-the-right-format", KEY)).toThrow();
  });

  it("throws when decrypting with the wrong key (authTag mismatch)", () => {
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP", KEY);
    const wrongKey = "1".repeat(64);
    expect(() => decryptMfaSecret(encrypted, wrongKey)).toThrow();
  });
});
