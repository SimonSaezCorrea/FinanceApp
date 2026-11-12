import { describe, expect, it } from "vitest";

import {
  clientKey,
  RateLimitStore,
  rateLimitsEnabled,
  wideClientKey,
} from "../../../../src/infra/http/rate-limit";

const config = (values: Record<string, string | undefined>) => ({
  get: <T>(key: string) => values[key] as T,
});

describe("rateLimitsEnabled", () => {
  it("is on in production and off anywhere else", () => {
    expect(rateLimitsEnabled(config({ NODE_ENV: "production" }))).toBe(true);
    expect(rateLimitsEnabled(config({ NODE_ENV: "development" }))).toBe(false);
    expect(rateLimitsEnabled(config({}))).toBe(false);
  });

  it("RATE_LIMITS_ENABLED overrides it either way, and anything else fails at boot", () => {
    expect(rateLimitsEnabled(config({ RATE_LIMITS_ENABLED: "true" }))).toBe(true);
    expect(
      rateLimitsEnabled(config({ NODE_ENV: "production", RATE_LIMITS_ENABLED: "false" })),
    ).toBe(false);
    expect(() => rateLimitsEnabled(config({ RATE_LIMITS_ENABLED: "yes" }))).toThrow();
  });
});

describe("clientKey", () => {
  it("keeps an IPv4 address and unwraps an IPv4-mapped IPv6 one", () => {
    expect(clientKey("203.0.113.7")).toBe("203.0.113.7");
    expect(clientKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("counts an IPv6 client by its /64, however the address is written", () => {
    const a = clientKey("2001:db8:abcd:12:1::1");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(clientKey("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe(a);
    expect(clientKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientKey("2001:db8:abcd:13::1")).not.toBe(a);
  });

  it("groups an IPv6 client by its /48 too, and an IPv4 one not at all", () => {
    expect(wideClientKey("2001:db8:abcd:12:1::1")).toBe("2001:db8:abcd::/48");
    expect(wideClientKey("2001:db8:abcd:ffff::9")).toBe("2001:db8:abcd::/48");
    expect(wideClientKey("203.0.113.7")).toBeNull();
    expect(wideClientKey("::ffff:203.0.113.7")).toBeNull();
  });

  it("never throws on a missing address", () => {
    expect(clientKey(undefined)).toBe("unknown");
  });
});

describe("RateLimitStore", () => {
  it("lets `limit` requests through per window and says how long to wait after", () => {
    const store = new RateLimitStore();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(store.hit("k", 3, 60, now)).toBeNull();
    expect(store.hit("k", 3, 60, now + 10_000)).toBe(50);
    // Another key has its own count.
    expect(store.hit("other", 3, 60, now)).toBeNull();
  });

  it("starts a new window once the previous one ran out", () => {
    const store = new RateLimitStore();
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) store.hit("k", 3, 60, now);
    expect(store.hit("k", 3, 60, now + 60_000)).toBeNull();
  });

  it("never grows past its cap under a flood of distinct keys", () => {
    const store = new RateLimitStore(100);
    for (let i = 0; i < 1_000; i++) store.hit(`k${i}`, 3, 600, 1_000_000);
    expect(store.size).toBeLessThanOrEqual(100);
  });

  it("a flood of new keys never erases a client that is being held back", () => {
    const store = new RateLimitStore(100);
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) store.hit("blocked", 3, 600, now);
    for (let i = 0; i < 1_000; i++) store.hit(`flood${i}`, 3, 600, now);
    expect(store.hit("blocked", 3, 600, now + 1_000)).not.toBeNull();
  });
});
