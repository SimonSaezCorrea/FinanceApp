import { beforeEach, describe, expect, it } from "vitest";

import {
  claimOnce,
  releaseClaim,
  resetOneTimeClaims,
} from "../../../../src/infra/auth/one-time-claims";

describe("one-time claims", () => {
  beforeEach(() => resetOneTimeClaims());

  it("lets a key through once until it expires", () => {
    const now = 1_000;
    expect(claimOnce("k", now + 60_000, now)).toBe(true);
    expect(claimOnce("k", now + 60_000, now + 1)).toBe(false);
    // Past its expiry the token itself is invalid, so the key is free again.
    expect(claimOnce("k", now + 120_000, now + 60_001)).toBe(true);
  });

  it("gives a released claim back", () => {
    expect(claimOnce("k", Date.now() + 60_000)).toBe(true);
    releaseClaim("k");
    expect(claimOnce("k", Date.now() + 60_000)).toBe(true);
  });

  it("keeps different keys apart", () => {
    expect(claimOnce("a", Date.now() + 60_000)).toBe(true);
    expect(claimOnce("b", Date.now() + 60_000)).toBe(true);
  });
});
