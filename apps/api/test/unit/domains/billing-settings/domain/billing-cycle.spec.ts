import { describe, expect, it } from "vitest";

import {
  addBusinessDays,
  isBusinessDay,
  nextBoundaryAfter,
  paymentDueDate,
} from "../../../../../src/domains/billing-settings/domain/billing-cycle";

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
  it("BUSINESS_DAY: counts business days directly after the close itself (BCI real-world: 22 Jul close -> 10 días hábiles -> 5 Aug due)", () => {
    const due = paymentDueDate(new Date("2026-07-22T00:00:00Z"), 10, "BUSINESS_DAY");
    expect(due.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("BUSINESS_DAY: is exactly addBusinessDays(closedAt, dueBusinessDays) — same mechanism generation uses", () => {
    const closedAt = new Date("2026-08-20T00:00:00Z");
    expect(paymentDueDate(closedAt, 10, "BUSINESS_DAY").toISOString()).toBe(
      addBusinessDays(closedAt, 10).toISOString(),
    );
  });

  it("BUSINESS_DAY: rolls into the next month/year like any other business-day count", () => {
    const due = paymentDueDate(new Date("2026-12-30T00:00:00Z"), 3, "BUSINESS_DAY");
    expect(due.getUTCFullYear()).toBe(2027);
  });

  it("CALENDAR_DAY: first occurrence of the day-of-month strictly after closedAt, independent of generation's own cycle type", () => {
    const due = paymentDueDate(new Date("2026-07-22T00:00:00Z"), 5, "CALENDAR_DAY");
    expect(due.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("CALENDAR_DAY: rolls into the next month when the day already passed this month", () => {
    const due = paymentDueDate(new Date("2026-12-30T00:00:00Z"), 3, "CALENDAR_DAY");
    expect(due.toISOString()).toBe("2027-01-03T00:00:00.000Z");
  });
});
