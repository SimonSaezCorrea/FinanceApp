import { describe, expect, it } from "vitest";

import { currentCycleStart } from "./billing-cycle";

describe("currentCycleStart", () => {
  it("returns null when no billing day is configured (all-time, backward compatible)", () => {
    expect(currentCycleStart(null, new Date("2026-07-22T12:00:00Z"))).toBeNull();
  });

  it("returns this month's cut-off when today is on or after the billing day", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const start = currentCycleStart(15, now);
    expect(start?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("returns this month's cut-off exactly on the billing day itself", () => {
    const now = new Date("2026-07-15T23:59:00Z");
    const start = currentCycleStart(15, now);
    expect(start?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("returns last month's cut-off when today is before the billing day", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const start = currentCycleStart(15, now);
    expect(start?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("rolls back across a year boundary (January before the cut-off)", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const start = currentCycleStart(15, now);
    expect(start?.toISOString()).toBe("2025-12-15T00:00:00.000Z");
  });

  it("handles day 28 correctly even in short months (no clamping needed, 1-28 always exists)", () => {
    const now = new Date("2026-02-27T12:00:00Z");
    const start = currentCycleStart(28, now);
    expect(start?.toISOString()).toBe("2026-01-28T00:00:00.000Z");
  });
});
