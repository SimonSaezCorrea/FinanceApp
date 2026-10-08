import { describe, expect, it } from "vitest";

import type { accounts, debts } from "@finance/contracts";

import { netWorth, secondaryTotals } from "../../dashboard/lib/metrics";
import { netWorthByCurrency } from "./netWorth";

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
