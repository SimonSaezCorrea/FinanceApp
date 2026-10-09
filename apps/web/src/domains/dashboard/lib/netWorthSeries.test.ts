import { describe, expect, it } from "vitest";

import type { transactions } from "@finance/contracts";

import { netWorthSeries, SERIES_DAYS } from "./metrics";

const now = new Date(2026, 9, 7, 12, 0);
const tx = (over: Partial<transactions.Transaction>) =>
  ({
    id: "t",
    type: "EXPENSE",
    amount: "1000",
    currency: "CLP",
    bankAccountId: "a",
    occurredAt: new Date(2026, 9, 5, 0, 0).toISOString(),
    transferGroupId: null,
    paidStatementId: null,
    prepaymentStatementId: null,
    settlesStatementId: null,
    debtId: null,
    ...over,
  }) as transactions.Transaction;

describe("netWorthSeries", () => {
  it("ends exactly at today's net worth and undoes later movements going back", () => {
    const series = netWorthSeries("100000", [tx({}), tx({ type: "INCOME", amount: "500" })], now);
    expect(series).toHaveLength(SERIES_DAYS);
    expect(Number(series.at(-1))).toBe(100000);
    // Before the 5th: the 1000 expense hadn't happened yet, the 500 income neither.
    expect(Number(series.at(-4))).toBe(100500);
    // From the 5th on, both are in.
    expect(Number(series.at(-3))).toBe(100000);
  });

  it("ignores internal flows, debt payments, other currencies and future movements", () => {
    const series = netWorthSeries(
      "100000",
      [
        tx({ transferGroupId: "g" }),
        tx({ paidStatementId: "s" }),
        tx({ debtId: "d" }),
        tx({ currency: "USD" }),
        tx({ occurredAt: new Date(2026, 9, 16).toISOString() }),
      ],
      now,
    );
    expect(series.every((p) => Number(p) === 100000)).toBe(true);
  });
});
