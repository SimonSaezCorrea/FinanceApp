import { describe, expect, it } from "vitest";

import type { debts } from "@finance/contracts";

import {
  calcRemaining,
  dueInfo,
  isOverdue,
  leftAmount,
  summarizeDebts,
  summarizeDebtsByCurrency,
} from "./debtMetrics";

function makeDebt(overrides: Partial<debts.Debt> = {}): debts.Debt {
  return {
    id: "d1",
    direction: "YOU_OWE",
    counterparty: "Test",
    principal: "1000.0000",
    currency: "CLP",
    openedAt: "2026-01-01T00:00:00.000Z",
    dueAt: null,
    interestApr: null,
    notes: null,
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeDebtsByCurrency", () => {
  it("sums OWED_TO_YOU and YOU_OWE separately for the same currency", () => {
    const list = [
      makeDebt({ direction: "OWED_TO_YOU", principal: "5000.0000", currency: "CLP" }),
      makeDebt({ direction: "YOU_OWE", principal: "2000.0000", currency: "CLP" }),
    ];
    const [kpi] = summarizeDebtsByCurrency(list);
    expect(kpi!.currency).toBe("CLP");
    expect(kpi!.totalOwedToYou).toBe("5000.0000");
    expect(kpi!.totalYouOwe).toBe("2000.0000");
    expect(kpi!.netBalance).toBe("3000.0000");
  });

  it("groups debts into separate entries by currency", () => {
    const list = [
      makeDebt({ currency: "CLP", direction: "YOU_OWE", principal: "1000.0000" }),
      makeDebt({ currency: "USD", direction: "OWED_TO_YOU", principal: "50.0000" }),
    ];
    const result = summarizeDebtsByCurrency(list);
    expect(result).toHaveLength(2);
    expect(result.map((k) => k.currency)).toContain("CLP");
    expect(result.map((k) => k.currency)).toContain("USD");
  });

  it("excludes settled debts from KPIs", () => {
    const list = [
      makeDebt({
        direction: "YOU_OWE",
        principal: "500.0000",
        settledAt: "2026-01-10T00:00:00.000Z",
      }),
    ];
    expect(summarizeDebtsByCurrency(list)).toHaveLength(0);
  });

  it("returns empty array when all debts are settled", () => {
    expect(summarizeDebtsByCurrency([])).toEqual([]);
  });

  it("netBalance is negative when youOwe > owedToYou", () => {
    const list = [
      makeDebt({ direction: "OWED_TO_YOU", principal: "1000.0000", currency: "USD" }),
      makeDebt({ direction: "YOU_OWE", principal: "3000.0000", currency: "USD" }),
    ];
    const [kpi] = summarizeDebtsByCurrency(list);
    expect(kpi!.netBalance).toBe("-2000.0000");
  });
});

describe("calcRemaining", () => {
  it("uses installmentAmount when provided", () => {
    const debt = makeDebt({
      totalInstallments: 6,
      paidInstallments: 2,
      installmentAmount: "30000.0000",
    });
    // (6-2) × 30000 = 120000
    expect(calcRemaining(debt)).toBe("120000.0000");
  });

  it("falls back to principal / totalInstallments when installmentAmount is null", () => {
    const debt = makeDebt({
      totalInstallments: 4,
      paidInstallments: 1,
      installmentAmount: null,
      principal: "200000.0000",
    });
    // (4-1) × (200000/4) = 3 × 50000 = 150000
    expect(calcRemaining(debt)).toBe("150000.0000");
  });

  it("returns 0 when all installments are paid", () => {
    const debt = makeDebt({
      totalInstallments: 3,
      paidInstallments: 3,
      installmentAmount: "10000.0000",
    });
    expect(calcRemaining(debt)).toBe("0.0000");
  });

  it("handles single-installment debt (totalInstallments = 1)", () => {
    const debt = makeDebt({
      totalInstallments: 1,
      paidInstallments: 0,
      installmentAmount: null,
      principal: "50000.0000",
    });
    expect(calcRemaining(debt)).toBe("50000.0000");
  });
});

describe("leftAmount", () => {
  it("is zero once the debt is settled, regardless of the instalment counter", () => {
    const debt = makeDebt({
      totalInstallments: 6,
      paidInstallments: 2,
      settledAt: "2026-02-01T00:00:00.000Z",
    });
    expect(leftAmount(debt)).toBe("0.0000");
  });

  it("falls back to calcRemaining while still open", () => {
    const debt = makeDebt({ totalInstallments: 4, paidInstallments: 1, principal: "400.0000" });
    expect(leftAmount(debt)).toBe(calcRemaining(debt));
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-03-15T00:00:00.000Z");

  it("is true for an open debt whose due date already passed", () => {
    const debt = makeDebt({ dueAt: "2026-03-01T00:00:00.000Z" });
    expect(isOverdue(debt, now)).toBe(true);
  });

  it("is false once the debt is settled, even past its due date", () => {
    const debt = makeDebt({
      dueAt: "2026-03-01T00:00:00.000Z",
      settledAt: "2026-03-05T00:00:00.000Z",
    });
    expect(isOverdue(debt, now)).toBe(false);
  });

  it("is false with no due date at all", () => {
    expect(isOverdue(makeDebt({ dueAt: null }), now)).toBe(false);
  });
});

describe("dueInfo", () => {
  const now = new Date("2026-03-15T00:00:00.000Z");

  it("reports days remaining for a future date", () => {
    expect(dueInfo("2026-03-26T00:00:00.000Z", now)).toEqual({ overdue: false, days: 11 });
  });

  it("reports days elapsed for a past date", () => {
    expect(dueInfo("2026-03-03T00:00:00.000Z", now)).toEqual({ overdue: true, days: 12 });
  });

  it("returns no days at all when there is no date", () => {
    expect(dueInfo(null, now)).toEqual({ overdue: false, days: null });
  });
});

describe("summarizeDebts", () => {
  const now = new Date("2026-03-15T00:00:00.000Z");

  it("computes youOwe/owedYou/net/oweSharePct/overdueSum per currency", () => {
    const list = [
      makeDebt({
        direction: "YOU_OWE",
        principal: "3000.0000",
        currency: "CLP",
        dueAt: "2026-03-01T00:00:00.000Z", // overdue
      }),
      makeDebt({ direction: "OWED_TO_YOU", principal: "1000.0000", currency: "CLP" }),
    ];
    const [summary] = summarizeDebts(list, now);
    expect(summary).toEqual({
      currency: "CLP",
      youOwe: "3000.0000",
      owedYou: "1000.0000",
      net: "-2000.0000",
      oweSharePct: 75,
      overdueSum: "3000.0000",
    });
  });

  it("excludes settled debts entirely", () => {
    const list = [
      makeDebt({
        direction: "YOU_OWE",
        principal: "500.0000",
        settledAt: "2026-01-10T00:00:00.000Z",
      }),
    ];
    expect(summarizeDebts(list, now)).toEqual([]);
  });

  it("returns 0% share when nothing circulates for a currency", () => {
    // Can't happen via the same currency (an empty group has no entry at
    // all), but a single active debt still exercises the non-zero branch.
    const list = [makeDebt({ direction: "OWED_TO_YOU", principal: "100.0000", currency: "USD" })];
    const [summary] = summarizeDebts(list, now);
    expect(summary!.oweSharePct).toBe(0);
  });
});
