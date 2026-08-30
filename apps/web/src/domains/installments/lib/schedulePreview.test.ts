import { describe, expect, it } from "vitest";

import { equalPrincipalSchedule } from "@finance/money";

import { schedulePreview } from "./schedulePreview";

const base = {
  totalPrincipal: "1200",
  installmentCount: 3,
  startDate: "2026-01-15T00:00:00.000Z",
  frequency: "MONTHLY" as const,
  frequencyInterval: 1,
};

describe("schedulePreview", () => {
  it("matches the schedule the server will store, instalment by instalment", () => {
    const preview = schedulePreview({ ...base, totalPrincipal: "500000", installmentCount: 7 })!;
    const server = equalPrincipalSchedule({ totalPrincipal: "500000", installmentCount: 7 });
    expect(preview.installmentAmount).toBe(server[0]!.payment);
    expect(preview.lastInstallmentAmount).toBe(server[6]!.payment);
    // 500.000/7 doesn't divide: the last instalment carries the remainder, and the
    // preview must show that adjusted figure rather than the tidy average (FR-041).
    expect(preview.hasRoundingAdjustment).toBe(true);
    expect(preview.installmentAmount).not.toBe(preview.lastInstallmentAmount);
  });

  it("reports no adjustment when the total divides exactly", () => {
    const preview = schedulePreview(base)!;
    expect(preview.installmentAmount).toBe("400.0000");
    expect(preview.hasRoundingAdjustment).toBe(false);
    expect(preview.total).toBe("1200.0000");
    expect(preview.financeCharge).toBe("0.0000");
  });

  it("reflects interest in the total and reports the finance charge", () => {
    const preview = schedulePreview({ ...base, aprPerPeriod: "0.02" })!;
    const server = equalPrincipalSchedule({
      totalPrincipal: "1200",
      installmentCount: 3,
      aprPerPeriod: "0.02",
    });
    expect(preview.installmentAmount).toBe(server[0]!.payment);
    // Interest costs more than the price: that difference is what gets charged to
    // the card's account as a finance charge (FR-045).
    expect(Number(preview.total)).toBeGreaterThan(1200);
    expect(Number(preview.financeCharge)).toBeCloseTo(Number(preview.total) - 1200, 4);
  });

  it("steps the last due date by frequency × interval", () => {
    const monthly = schedulePreview({ ...base, installmentCount: 12 })!;
    expect(monthly.firstDueDate.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(monthly.lastDueDate.toISOString().slice(0, 10)).toBe("2026-12-15");

    const biweekly = schedulePreview({
      ...base,
      frequency: "WEEKLY",
      frequencyInterval: 2,
      installmentCount: 3,
    })!;
    expect(biweekly.lastDueDate.toISOString().slice(0, 10)).toBe("2026-02-12");
  });

  // FR-043: not enough to describe a schedule is a state of its own, not a zero.
  it("returns null on insufficient input", () => {
    expect(schedulePreview({ ...base, totalPrincipal: "" })).toBeNull();
    expect(schedulePreview({ ...base, totalPrincipal: "0" })).toBeNull();
    expect(schedulePreview({ ...base, installmentCount: 0 })).toBeNull();
    expect(schedulePreview({ ...base, startDate: "not a date" })).toBeNull();
  });
});
