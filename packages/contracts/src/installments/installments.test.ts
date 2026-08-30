import { describe, expect, it } from "vitest";

import {
  dueAmountOf,
  generatesMovementOnPay,
  installmentStatus,
  planCounters,
  planStatus,
} from "./index";

/**
 * The shared predicates of the installments domain. They live in the contract for
 * the same reason `isDeletableAccount` and `isValidCbu` do: the UI and the API must
 * answer the same question the same way, or the UI ends up offering an action the
 * API is going to refuse.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("planStatus", () => {
  it("is PAID when there is no unpaid installment left", () => {
    expect(planStatus(null, NOW, false)).toBe("PAID");
    // Nothing owing outranks a stale flag: if no installment is left, it is paid.
    expect(planStatus(null, NOW, true)).toBe("PAID");
  });

  it("is PARTIALLY_PAID when the only one left was paid in part (FR-023)", () => {
    // A shortfall on the LAST installment has no successor to carry into, so that
    // installment stays unpaid holding its partial credit, and the plan stays active.
    expect(planStatus("2026-08-20T00:00:00.000Z", NOW, true)).toBe("PARTIALLY_PAID");
  });

  it("is OVERDUE when the oldest unpaid installment was due before today", () => {
    expect(planStatus("2026-08-10T00:00:00.000Z", NOW, false)).toBe("OVERDUE");
  });

  it("is DUE_SOON within the next 7 days", () => {
    expect(planStatus("2026-08-20T00:00:00.000Z", NOW, false)).toBe("DUE_SOON");
  });

  it("is ON_TRACK further out than 7 days", () => {
    expect(planStatus("2026-09-05T00:00:00.000Z", NOW, false)).toBe("ON_TRACK");
  });

  it("treats the 7-day boundary as DUE_SOON and the day after as ON_TRACK", () => {
    expect(planStatus("2026-08-22T12:00:00.000Z", NOW, false)).toBe("DUE_SOON");
    expect(planStatus("2026-08-22T12:00:00.001Z", NOW, false)).toBe("ON_TRACK");
  });

  it("prefers PARTIALLY_PAID over OVERDUE: 'you paid part of it' is not 'you never paid'", () => {
    expect(planStatus("2026-08-10T00:00:00.000Z", NOW, true)).toBe("PARTIALLY_PAID");
  });
});

describe("dueAmountOf", () => {
  it("is the scheduled amount when nothing was carried in", () => {
    expect(dueAmountOf({ amount: "41583.0000", carriedOverAmount: "0" })).toBe("41583.0000");
  });

  it("adds a carried-over shortfall to the scheduled amount", () => {
    expect(dueAmountOf({ amount: "41583.0000", carriedOverAmount: "11583.0000" })).toBe(
      "53166.0000",
    );
  });

  it("subtracts a carried-over surplus (a negative carry)", () => {
    expect(dueAmountOf({ amount: "41583.0000", carriedOverAmount: "-8417.0000" })).toBe(
      "33166.0000",
    );
  });

  it("never reports a negative amount owed", () => {
    // FR-021a: a surplus big enough to swallow the whole installment settles it; it
    // does not turn the installment into money the plan owes back.
    expect(dueAmountOf({ amount: "10000", carriedOverAmount: "-25000" })).toBe("0.0000");
  });
});

describe("generatesMovementOnPay", () => {
  it("is false for a CREDIT card: that debt is already in its statement", () => {
    expect(generatesMovementOnPay("CREDIT")).toBe(false);
  });

  it("is true for DEBIT and PREPAID: the money leaves on each installment", () => {
    expect(generatesMovementOnPay("DEBIT")).toBe(true);
    expect(generatesMovementOnPay("PREPAID")).toBe(true);
  });

  it("is true with no card at all (a bank loan has no statement behind it)", () => {
    expect(generatesMovementOnPay(null)).toBe(true);
  });
});

describe("installmentStatus", () => {
  it("is SCHEDULED while the instalment has neither been billed nor paid", () => {
    expect(installmentStatus({ paidAt: null, creditStatementId: null })).toBe("SCHEDULED");
  });

  it("is BILLED once a period charged it but that period is unpaid", () => {
    expect(installmentStatus({ paidAt: null, creditStatementId: "st_1" })).toBe("BILLED");
  });

  it("is PAID once it is settled, whether or not a period charged it", () => {
    // A non-credit-card plan is paid instalment by instalment and never gets billed.
    expect(installmentStatus({ paidAt: "2026-08-15T00:00:00.000Z", creditStatementId: null })).toBe(
      "PAID",
    );
  });

  it("lets PAID win over BILLED: the link survives settlement and must not hide it", () => {
    // FR-020 needs `creditStatementId` AFTER payment, to reach the settling period.
    // Testing `creditStatementId` first would report a settled instalment as BILLED.
    expect(installmentStatus({ paidAt: "2026-08-15T00:00:00.000Z", creditStatementId: "st_1" })).toBe(
      "PAID",
    );
  });
});

describe("planCounters", () => {
  const billed = { paidAt: null, creditStatementId: "st_1" };
  const scheduled = { paidAt: null, creditStatementId: null };
  const paid = { paidAt: "2026-08-15T00:00:00.000Z", creditStatementId: "st_0" };

  it("always partitions the schedule: the three counts sum to the instalment count", () => {
    const counters = planCounters([paid, paid, billed, scheduled, scheduled, scheduled]);
    expect(counters).toEqual({ paidCount: 2, billedCount: 1, scheduledCount: 3 });
    const total = counters.paidCount + counters.billedCount + counters.scheduledCount;
    expect(total).toBe(6);
  });

  it("counts an empty schedule as all zeros", () => {
    expect(planCounters([])).toEqual({ paidCount: 0, billedCount: 0, scheduledCount: 0 });
  });

  it("never reports a billed instalment on a plan that is not a credit-card plan", () => {
    // FR-005 regression guard: only the billing flow writes `creditStatementId`, and it
    // only ever runs for CREDIT-card plans. A non-zero billedCount here would mean the
    // feature leaked into plans it must not touch.
    const nonCreditSchedule = [paid, scheduled, scheduled];
    expect(planCounters(nonCreditSchedule).billedCount).toBe(0);
  });
});
