import { describe, expect, it } from "vitest";

import type { accounts, debts, transactions } from "@finance/contracts";

import { excludeTransfers, expensesByCategory, monthFlow, netWorth } from "./metrics";

const tx = (over: Partial<transactions.Transaction>): transactions.Transaction => ({
  id: "t1",
  type: "EXPENSE",
  amount: "1000",
  currency: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
  category: "Comida",
  description: null,
  observation: null,
  emisor: null,
  receptor: null,
  lugar: null,
  bankAccountId: "a1",
  cardId: null,
  financeCharge: false,
  installmentPlanId: null,
  transferGroupId: null,
  debtId: null,
  recurringExpenseId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const transferPair = [
  tx({ id: "x1", type: "EXPENSE", amount: "5000", transferGroupId: "g1", category: "Traspaso" }),
  tx({ id: "x2", type: "INCOME", amount: "5000", transferGroupId: "g1", category: "Traspaso" }),
];

describe("dashboard metrics exclude transfers", () => {
  it("month flow ignores both legs", () => {
    const withoutTransfer = monthFlow([tx({ id: "a", type: "INCOME", amount: "3000" })]);
    const withTransfer = monthFlow([
      tx({ id: "a", type: "INCOME", amount: "3000" }),
      ...transferPair,
    ]);
    expect(withTransfer).toEqual(withoutTransfer);
  });

  it("the category donut ignores the outgoing leg", () => {
    const slices = expensesByCategory([tx({ id: "a" }), ...transferPair]);
    expect(slices).toEqual([{ category: "Comida", total: "1000.0000" }]);
  });

  it("excludeTransfers keeps ordinary movements", () => {
    expect(excludeTransfers([tx({ id: "a" }), ...transferPair]).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("netWorth con deuda", () => {
  const account = (over: Partial<accounts.BankAccount> = {}): accounts.BankAccount =>
    ({
      currency: "CLP",
      currentBalance: "100000",
      creditUsed: "0",
      balanceSeries: [],
      ...over,
    }) as accounts.BankAccount;
  const debt = (over: Partial<debts.Debt> = {}): debts.Debt =>
    ({
      direction: "YOU_OWE",
      principal: "50000",
      currency: "CLP",
      settledAt: null,
      ...over,
    }) as debts.Debt;

  it("resta el cupo ya usado: la deuda rotativa es deuda", () => {
    expect(netWorth([account({ creditUsed: "30000" })]).total).toBe("70000.0000");
  });

  it("resta un préstamo pendiente y suma lo que a mí me deben", () => {
    expect(netWorth([account()], [debt()]).total).toBe("50000.0000");
    expect(netWorth([account()], [debt({ direction: "OWED_TO_YOU" })]).total).toBe("150000.0000");
  });

  it("ignora deudas liquidadas y las de otra moneda", () => {
    expect(netWorth([account()], [debt({ settledAt: "2026-01-01T00:00:00.000Z" })]).total).toBe(
      "100000.0000",
    );
    expect(netWorth([account()], [debt({ currency: "USD" })]).total).toBe("100000.0000");
  });
});
