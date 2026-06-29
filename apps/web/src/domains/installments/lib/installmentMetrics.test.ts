import { describe, expect, it } from "vitest";

import type { installments } from "@finance/contracts";

import { monthlyAmount, nextDuePayment, paymentStatus } from "./installmentMetrics";

function makePayment(overrides: Partial<installments.InstallmentPayment> = {}): installments.InstallmentPayment {
  return {
    id: "p1",
    sequence: 1,
    dueDate: "2026-02-01T00:00:00.000Z",
    amount: "10000.0000",
    paidAt: null,
    ...overrides,
  };
}

function makePlan(overrides: Partial<installments.InstallmentPlan> = {}): installments.InstallmentPlan {
  return {
    id: "plan1",
    title: "Laptop",
    totalPrincipal: "120000.0000",
    installmentCount: 12,
    startDate: "2026-01-01T00:00:00.000Z",
    currency: "CLP",
    notes: null,
    payments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("nextDuePayment", () => {
  it("returns the first payment with paidAt === null", () => {
    const payments = [
      makePayment({ sequence: 1, paidAt: "2026-02-01T00:00:00.000Z" }),
      makePayment({ id: "p2", sequence: 2, paidAt: null }),
      makePayment({ id: "p3", sequence: 3, paidAt: null }),
    ];
    const result = nextDuePayment(payments);
    expect(result?.sequence).toBe(2);
  });

  it("returns null when all payments are paid", () => {
    const payments = [
      makePayment({ sequence: 1, paidAt: "2026-02-01T00:00:00.000Z" }),
      makePayment({ id: "p2", sequence: 2, paidAt: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(nextDuePayment(payments)).toBeNull();
  });

  it("returns null for empty payments array", () => {
    expect(nextDuePayment([])).toBeNull();
  });
});

describe("paymentStatus", () => {
  it("returns 'paid' when paidAt is set", () => {
    const p = makePayment({ paidAt: "2026-02-01T00:00:00.000Z" });
    expect(paymentStatus(p, [p])).toBe("paid");
  });

  it("returns 'upcoming' for the first unpaid payment", () => {
    const p1 = makePayment({ sequence: 1, paidAt: "2026-02-01T00:00:00.000Z" });
    const p2 = makePayment({ id: "p2", sequence: 2, paidAt: null });
    const p3 = makePayment({ id: "p3", sequence: 3, paidAt: null });
    expect(paymentStatus(p2, [p1, p2, p3])).toBe("upcoming");
    expect(paymentStatus(p3, [p1, p2, p3])).toBe("pending");
  });

  it("returns 'pending' for payments after the upcoming one", () => {
    const p1 = makePayment({ sequence: 1, paidAt: null });
    const p2 = makePayment({ id: "p2", sequence: 2, paidAt: null });
    expect(paymentStatus(p2, [p1, p2])).toBe("pending");
  });
});

describe("monthlyAmount", () => {
  it("divides totalPrincipal by installmentCount", () => {
    const plan = makePlan({ totalPrincipal: "120000.0000", installmentCount: 12 });
    expect(monthlyAmount(plan)).toBe("10000.0000");
  });

  it("handles non-round division with correct precision", () => {
    const plan = makePlan({ totalPrincipal: "100000.0000", installmentCount: 3 });
    // 100000 / 3 = 33333.3333... → 33333.3333 (4dp, ROUND_HALF_EVEN)
    expect(monthlyAmount(plan)).toBe("33333.3333");
  });
});
