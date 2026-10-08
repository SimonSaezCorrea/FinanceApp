import { describe, expect, it } from "vitest";

import type { accounts, debts } from "@finance/contracts";

import { netWorth, secondaryTotals } from "../../dashboard/lib/metrics";
import { estimatedTotalClp, netWorthByCurrency, type CurrencyNetWorth } from "./netWorth";

const acc = (over: Partial<accounts.BankAccount>) =>
  ({
    id: "a",
    type: "CHECKING",
    currency: "CLP",
    currentBalance: "0",
    creditUsed: "0",
    balanceSeries: [],
    ...over,
  }) as accounts.BankAccount;

const debt = (over: Partial<debts.Debt>) =>
  ({
    id: "d",
    direction: "YOU_OWE",
    currency: "CLP",
    principal: "100000",
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    ...over,
  }) as unknown as debts.Debt;

const list = [
  acc({ currentBalance: "1000000" }),
  // A credit card account's own balance is not money held; only its debt counts.
  acc({ id: "tc", type: "CREDIT_CARD", currentBalance: "5000", creditUsed: "300000" }),
  acc({ id: "usd", currency: "USD", currentBalance: "500" }),
];
const debtList = [
  debt({ direction: "OWED_TO_YOU", principal: "50000" }),
  debt({ id: "du", currency: "USD", principal: "100" }),
];

describe("netWorthByCurrency", () => {
  it("one net per currency, primary first, never converted", () => {
    const [clp, usd] = netWorthByCurrency(list, debtList, "CLP");
    expect(clp).toMatchObject({ currency: "CLP" });
    expect(Number(clp!.assets)).toBe(1000000);
    expect(Number(clp!.cardDebt)).toBe(300000);
    expect(Number(clp!.debts)).toBe(50000);
    expect(Number(clp!.net)).toBe(750000);
    expect(usd!.currency).toBe("USD");
    expect(Number(usd!.net)).toBe(400);
  });

  it("is exactly what the Panel shows", () => {
    expect(Number(netWorth(list, debtList).total)).toBe(750000);
    expect(secondaryTotals(list, debtList).map((s) => [s.currency, Number(s.total)])).toEqual([
      ["USD", 400],
    ]);
  });
});

describe("estimatedTotalClp (spec 030)", () => {
  const net = (currency: string, value: string): CurrencyNetWorth => ({
    currency,
    assets: value,
    cardDebt: "0",
    debts: "0",
    net: value,
  });
  const usd = { currency: "USD" as const, date: "2026-10-08", value: "950", valueDate: "2026-10-08" };
  const clf = { currency: "CLF" as const, date: "2026-10-08", value: "41000", valueDate: "2026-10-08" };

  it("adds the pesos net to every other currency at its latest rate", () => {
    const total = estimatedTotalClp([net("CLP", "750000"), net("USD", "400")], { USD: usd, CLF: clf });

    expect(total?.total).toBe("1130000"); // 750.000 + 400 × 950
  });

  it("includes the UF at its own value", () => {
    const total = estimatedTotalClp(
      [net("CLP", "750000"), net("CLF", "2")],
      { USD: usd, CLF: clf },
    );

    expect(total?.total).toBe("832000"); // 750.000 + 2 × 41.000
  });

  it("subtracts a negative net (more debt than assets in that currency)", () => {
    const total = estimatedTotalClp([net("CLP", "100000"), net("USD", "-20")], { USD: usd, CLF: clf });

    expect(total?.total).toBe("81000");
  });

  it("rounds once, at the end (two small fractions do not each round up)", () => {
    const rate = { ...usd, value: "950.4" };
    const total = estimatedTotalClp([net("CLP", "0"), net("USD", "0.5"), net("CLF", "0")], {
      USD: rate,
      CLF: clf,
    });

    expect(total?.total).toBe("475"); // 0,5 × 950,4 = 475,2
  });

  it("is null when a currency with a balance has no recorded rate (it would silently drop it)", () => {
    expect(estimatedTotalClp([net("CLP", "1"), net("USD", "400")], { USD: null, CLF: clf })).toBeNull();
  });

  it("is null for a currency it cannot convert (no invented number)", () => {
    expect(estimatedTotalClp([net("CLP", "1"), net("EUR", "10")], { USD: usd, CLF: clf })).toBeNull();
  });

  it("ignores a currency whose net is zero, rate or not", () => {
    const total = estimatedTotalClp([net("CLP", "5000"), net("USD", "0")], { USD: null, CLF: null });

    expect(total).toBeNull(); // nothing foreign to estimate: the pesos figure already IS the total
  });

  it("is null when there is nothing but pesos", () => {
    expect(estimatedTotalClp([net("CLP", "5000")], { USD: usd, CLF: clf })).toBeNull();
  });

  it("reports the oldest value date it used, and whether any rate was carried", () => {
    const old = { ...usd, valueDate: "2026-10-05" };
    const total = estimatedTotalClp([net("CLP", "1"), net("USD", "1"), net("CLF", "1")], {
      USD: old,
      CLF: clf,
    });

    expect(total).toMatchObject({ valueDate: "2026-10-05", carried: true });
  });

  it("works when the primary currency is not pesos (only the CLP net counts as pesos)", () => {
    const total = estimatedTotalClp([net("USD", "100"), net("CLP", "1000")], { USD: usd, CLF: clf });

    expect(total?.total).toBe("96000");
  });
});
