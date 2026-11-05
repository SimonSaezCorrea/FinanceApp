import { describe, expect, it } from "vitest";

import {
  generateMfaCode,
  mfaCodeExpiry,
  resendWaitSeconds,
} from "../../../../../src/domains/mfa-code/domain/mfa-code";

const at = (iso: string) => new Date(iso);

describe("mfa-code (specs/040)", () => {
  it("generates 6 digits, keeping leading zeros", () => {
    for (let i = 0; i < 50; i++) expect(generateMfaCode()).toMatch(/^\d{6}$/);
  });

  it("expires 10 minutes after it was issued", () => {
    const now = at("2026-11-05T12:00:00Z");
    expect(mfaCodeExpiry(now).toISOString()).toBe("2026-11-05T12:10:00.000Z");
  });

  it("allows a send with nothing issued, and asks to wait a minute after the last one", () => {
    const now = at("2026-11-05T12:00:30Z");
    expect(resendWaitSeconds({ now, issuedLastHour: [] })).toBe(0);
    expect(resendWaitSeconds({ now, issuedLastHour: [at("2026-11-05T12:00:00Z")] })).toBe(30);
    expect(resendWaitSeconds({ now, issuedLastHour: [at("2026-11-05T11:59:00Z")] })).toBe(0);
  });

  it("after 5 in the hour waits until the oldest of them ages out", () => {
    const now = at("2026-11-05T12:30:00Z");
    const issued = ["11:40", "11:50", "12:00", "12:10", "12:20"].map((t) =>
      at(`2026-11-05T${t}:00Z`),
    );
    expect(resendWaitSeconds({ now, issuedLastHour: issued })).toBe(10 * 60);
  });
});
