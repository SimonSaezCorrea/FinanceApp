import { describe, expect, it } from "vitest";

import {
  addBusinessDays,
  currentCycleStart,
  isBusinessDay,
  nextBoundaryAfter,
  paymentDueDate,
} from "../../../../../src/domains/billing-settings/domain/billing-cycle";

describe("currentCycleStart", () => {
  it("returns null when no billing day is configured (all-time, backward compatible)", () => {
    expect(
      currentCycleStart(null, "CALENDAR_DAY", new Date("2026-07-22T12:00:00Z")),
    ).toBeNull();
  });

  it("returns null for a BUSINESS_DAY cycle (no fixed day-of-month to anchor on)", () => {
    expect(
      currentCycleStart(20, "BUSINESS_DAY", new Date("2026-07-22T12:00:00Z")),
    ).toBeNull();
  });

  it("returns this month's cut-off when today is on or after the billing day", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const start = currentCycleStart(15, "CALENDAR_DAY", now);
    expect(start?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("returns this month's cut-off exactly on the billing day itself", () => {
    const now = new Date("2026-07-15T23:59:00Z");
    const start = currentCycleStart(15, "CALENDAR_DAY", now);
    expect(start?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("returns last month's cut-off when today is before the billing day", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const start = currentCycleStart(15, "CALENDAR_DAY", now);
    expect(start?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("rolls back across a year boundary (January before the cut-off)", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const start = currentCycleStart(15, "CALENDAR_DAY", now);
    expect(start?.toISOString()).toBe("2025-12-15T00:00:00.000Z");
  });

  it("handles day 28 correctly even in short months (no clamping needed, 1-28 always exists)", () => {
    const now = new Date("2026-02-27T12:00:00Z");
    const start = currentCycleStart(28, "CALENDAR_DAY", now);
    expect(start?.toISOString()).toBe("2026-01-28T00:00:00.000Z");
  });
});

describe("isBusinessDay", () => {
  it("rejects Saturdays and Sundays", () => {
    expect(isBusinessDay(new Date("2026-08-22T00:00:00Z"))).toBe(false); // Saturday
    expect(isBusinessDay(new Date("2026-08-23T00:00:00Z"))).toBe(false); // Sunday
  });

  it("accepts an ordinary weekday", () => {
    expect(isBusinessDay(new Date("2026-08-24T00:00:00Z"))).toBe(true); // Monday
  });

  it("rejects a Chilean public holiday (Independencia, Sep 18)", () => {
    expect(isBusinessDay(new Date("2026-09-18T00:00:00Z"))).toBe(false);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends when counting forward", () => {
    // Friday 2026-08-21 + 1 business day -> Monday 2026-08-24 (weekend skipped)
    const result = addBusinessDays(new Date("2026-08-21T00:00:00Z"), 1);
    expect(result.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });

  it("never counts the anchor day itself", () => {
    // A business-day anchor + 1 still lands on the NEXT business day, not itself.
    const result = addBusinessDays(new Date("2026-08-24T00:00:00Z"), 1);
    expect(result.toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("skips a Chilean public holiday when counting", () => {
    // Thursday 2026-09-17 + 1 business day would land on Fri 18 (Independencia,
    // a public holiday) -> skips to Sat/Sun too -> Monday 2026-09-21.
    const result = addBusinessDays(new Date("2026-09-17T00:00:00Z"), 1);
    expect(result.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("nextBoundaryAfter", () => {
  it("CALENDAR_DAY: first occurrence of the day-of-month strictly after periodStart", () => {
    const boundary = nextBoundaryAfter(new Date("2026-01-05T00:00:00Z"), 5, "CALENDAR_DAY");
    expect(boundary.toISOString()).toBe("2026-02-05T00:00:00.000Z");
  });

  it("BUSINESS_DAY: N business days after periodStart, weekends/holidays skipped", () => {
    const boundary = nextBoundaryAfter(new Date("2026-08-21T00:00:00Z"), 1, "BUSINESS_DAY");
    expect(boundary.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });
});

describe("paymentDueDate", () => {
  it("counts business days directly after the close itself (BCI real-world: 22 Jul close -> 10 días hábiles -> 5 Aug due)", () => {
    const due = paymentDueDate(new Date("2026-07-22T00:00:00Z"), 10);
    expect(due.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("is exactly addBusinessDays(closedAt, dueBusinessDays) — same mechanism generation uses", () => {
    const closedAt = new Date("2026-08-20T00:00:00Z");
    expect(paymentDueDate(closedAt, 10).toISOString()).toBe(
      addBusinessDays(closedAt, 10).toISOString(),
    );
  });

  it("rolls into the next month/year like any other business-day count", () => {
    const due = paymentDueDate(new Date("2026-12-30T00:00:00Z"), 3);
    expect(due.getUTCFullYear()).toBe(2027);
  });
});
