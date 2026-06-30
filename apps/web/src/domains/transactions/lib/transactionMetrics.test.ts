import { describe, expect, it } from "vitest";

import type { transactions } from "@finance/contracts";

import { clientFilter, endOfMonth, startOfMonth, summarizeByCurrency } from "./transactionMetrics";

function tx(
  overrides: Partial<transactions.Transaction> & { type: transactions.TransactionType; amount: string; currency: string },
): transactions.Transaction {
  return {
    id: "t1",
    occurredAt: "2026-06-15T00:00:00.000Z",
    category: null,
    description: null,
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    bankAccountId: null,
    cardId: null,
    installmentPlanId: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeByCurrency", () => {
  it("returns empty array for empty input", () => {
    expect(summarizeByCurrency([])).toEqual([]);
  });

  it("groups by currency and sums correctly", () => {
    const txs = [
      tx({ type: "INCOME", amount: "1000.0000", currency: "CLP" }),
      tx({ type: "EXPENSE", amount: "400.0000", currency: "CLP" }),
      tx({ type: "INCOME", amount: "50.0000", currency: "USD" }),
    ];
    const result = summarizeByCurrency(txs);
    const clp = result.find((r) => r.currency === "CLP")!;
    const usd = result.find((r) => r.currency === "USD")!;

    expect(clp.totalIncome).toBe("1000.0000");
    expect(clp.totalExpense).toBe("400.0000");
    expect(clp.netBalance).toBe("600.0000");

    expect(usd.totalIncome).toBe("50.0000");
    expect(usd.totalExpense).toBe("0.0000");
    expect(usd.netBalance).toBe("50.0000");
  });

  it("computes negative net balance correctly", () => {
    const txs = [
      tx({ type: "EXPENSE", amount: "200.0000", currency: "USD" }),
      tx({ type: "INCOME", amount: "100.0000", currency: "USD" }),
    ];
    const result = summarizeByCurrency(txs);
    expect(result[0]!.netBalance).toBe("-100.0000");
  });

  it("handles single currency with only expenses", () => {
    const txs = [tx({ type: "EXPENSE", amount: "500.0000", currency: "EUR" })];
    const result = summarizeByCurrency(txs);
    expect(result[0]!.totalIncome).toBe("0.0000");
    expect(result[0]!.totalExpense).toBe("500.0000");
  });
});

describe("clientFilter", () => {
  const txs = [
    tx({ type: "EXPENSE", amount: "10.0000", currency: "CLP", category: "Supermercado" }),
    tx({ type: "EXPENSE", amount: "20.0000", currency: "CLP", category: "Netflix" }),
    tx({ type: "INCOME", amount: "100.0000", currency: "CLP", category: null }),
  ];

  it("returns all transactions for empty search string", () => {
    expect(clientFilter(txs, "")).toHaveLength(3);
  });

  it("filters case-insensitively by category substring", () => {
    expect(clientFilter(txs, "super")).toHaveLength(1);
    expect(clientFilter(txs, "SUPER")).toHaveLength(1);
    expect(clientFilter(txs, "net")).toHaveLength(1);
  });

  it("returns empty array when no matches", () => {
    expect(clientFilter(txs, "zzznomatch")).toHaveLength(0);
  });

  it("excludes null-category transactions when search is non-empty", () => {
    const results = clientFilter(txs, "super");
    expect(results.every((t) => t.category !== null)).toBe(true);
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
