import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_COOKIE_MAX_AGE_MS,
  TRUSTED_DEVICE_COOKIE_PATH,
  generateTrustedDeviceToken,
  hashTrustedDeviceToken,
} from "../../../../../src/domains/user/application/trusted-device-cookie";

describe("trusted-device cookie (specs/040)", () => {
  it("mints 32 random bytes as base64url, different every time", () => {
    const a = generateTrustedDeviceToken();
    const b = generateTrustedDeviceToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("stores the token's SHA-256 only", () => {
    const token = generateTrustedDeviceToken();
    const hash = hashTrustedDeviceToken(token);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
  });

  it("is an auth-path cookie that lasts 30 days", () => {
    expect(TRUSTED_DEVICE_COOKIE).toBe("mfa_trusted");
    expect(TRUSTED_DEVICE_COOKIE_PATH).toBe("/api/v1/auth");
    expect(TRUSTED_DEVICE_COOKIE_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
