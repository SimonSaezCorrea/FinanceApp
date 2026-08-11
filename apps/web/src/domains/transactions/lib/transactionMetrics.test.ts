import { describe, expect, it } from "vitest";

import { endOfMonth, startOfMonth, toCurrencyKpis } from "./transactionMetrics";

describe("toCurrencyKpis", () => {
  it("returns empty array for empty input", () => {
    expect(toCurrencyKpis([])).toEqual([]);
  });

  it("derives the net balance per currency at money scale", () => {
    const result = toCurrencyKpis([
      { currency: "CLP", income: "1000", expense: "400" },
      { currency: "USD", income: "50", expense: "0" },
    ]);
    const clp = result.find((r) => r.currency === "CLP")!;
    const usd = result.find((r) => r.currency === "USD")!;

    expect(clp.totalIncome).toBe("1000.0000");
    expect(clp.totalExpense).toBe("400.0000");
    expect(clp.netBalance).toBe("600.0000");

    expect(usd.totalIncome).toBe("50.0000");
    expect(usd.totalExpense).toBe("0.0000");
    expect(usd.netBalance).toBe("50.0000");
  });

  it("computes a negative net balance when expenses exceed income", () => {
    const result = toCurrencyKpis([{ currency: "USD", income: "100", expense: "200" }]);
    expect(result[0]!.netBalance).toBe("-100.0000");
  });

  it("does not lose precision on fractional amounts (decimal, not float)", () => {
    const result = toCurrencyKpis([{ currency: "USD", income: "0.1", expense: "0.3" }]);
    expect(result[0]!.netBalance).toBe("-0.2000");
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("startOfMonth returns first day of month at 00:00:00 UTC", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    expect(startOfMonth(d)).toBe("2026-06-01T00:00:00.000Z");
  });

  it("endOfMonth returns last day of month at 23:59:59 UTC", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    expect(endOfMonth(d)).toBe("2026-06-30T23:59:59.999Z");
  });

  it("handles February in a non-leap year", () => {
    const d = new Date("2025-02-10T00:00:00Z");
    expect(endOfMonth(d)).toBe("2025-02-28T23:59:59.999Z");
  });
});
