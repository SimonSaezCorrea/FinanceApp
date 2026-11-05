import { describe, expect, it } from "vitest";

import {
  deriveMfaCodeKey,
  hashMfaCode,
  verifyMfaCode,
} from "../../../../../src/domains/user/application/mfa-code-hash";

describe("mfa-code hash (specs/040)", () => {
  const key = deriveMfaCodeKey("a-test-encryption-key");

  it("derives the same key from the same secret, a different one from another", () => {
    expect(deriveMfaCodeKey("a-test-encryption-key").equals(key)).toBe(true);
    expect(deriveMfaCodeKey("other").equals(key)).toBe(false);
  });

  it("depends on the row id, so two equal codes never share a hash", () => {
    expect(hashMfaCode(key, "id-1", "123456")).not.toBe(hashMfaCode(key, "id-2", "123456"));
  });

  it("verifies only the right code for that row", () => {
    const stored = hashMfaCode(key, "id-1", "123456");
    expect(verifyMfaCode(key, "id-1", "123456", stored)).toBe(true);
    expect(verifyMfaCode(key, "id-1", "123457", stored)).toBe(false);
    expect(verifyMfaCode(key, "id-2", "123456", stored)).toBe(false);
    expect(verifyMfaCode(key, "id-1", "123456", "abc")).toBe(false);
  });
});
