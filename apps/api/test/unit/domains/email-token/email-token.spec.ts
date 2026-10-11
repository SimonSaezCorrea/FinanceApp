import { describe, expect, it } from "vitest";

import {
  MAX_TOKENS_PER_HOUR,
  expiresAtFor,
  generateToken,
  hashToken,
  isWithinResendWindow,
  oneHourBefore,
} from "../../../../src/domains/email-token/domain/email-token";

describe("email-token rules", () => {
  it("generates a 43-char base64url token and stores only its SHA-256", () => {
    const { token, tokenHash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it("never generates the same token twice", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken().token));
    expect(tokens.size).toBe(200);
  });

  it("expires a verification link at 48 h and a reset link at 30 min", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(expiresAtFor("VERIFY_EMAIL", now).toISOString()).toBe("2026-10-12T12:00:00.000Z");
    expect(expiresAtFor("RESET_PASSWORD", now).toISOString()).toBe("2026-10-10T12:30:00.000Z");
  });

  it("reuses a link sent less than 60 s ago", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(isWithinResendWindow(new Date("2026-10-10T11:59:30Z"), now)).toBe(true);
    expect(isWithinResendWindow(new Date("2026-10-10T11:58:59Z"), now)).toBe(false);
  });

  it("caps links at 5 per hour", () => {
    expect(MAX_TOKENS_PER_HOUR).toBe(5);
    expect(oneHourBefore(new Date("2026-10-10T12:00:00Z")).toISOString()).toBe(
      "2026-10-10T11:00:00.000Z",
    );
  });
});
