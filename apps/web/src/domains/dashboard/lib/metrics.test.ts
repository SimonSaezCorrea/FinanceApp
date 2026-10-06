import { describe, expect, it } from "vitest";

import type { accounts, debts, transactions } from "@finance/contracts";

import {
  type DueStatement,
  type UpcomingPayment,
  attentionItems,
  excludeTransfers,
  expensesByCategory,
  monthFlow,
  netWorth,
} from "./metrics";

const tx = (over: Partial<transactions.Transaction>): transactions.Transaction => ({
  id: "t1",
  type: "EXPENSE",
  amount: "1000",
  currency: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
  categoryId: "cat-food",
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
  savingsEntryId: null,
  savingsGoalId: null,
  paidStatementId: null,
  paidStatementAccountId: null,
  prepaymentStatementId: null,
  prepaymentAccountId: null,
  settlesStatementId: null,
  transferStatementId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const transferPair = [
  tx({ id: "x1", type: "EXPENSE", amount: "5000", transferGroupId: "g1" }),
  tx({ id: "x2", type: "INCOME", amount: "5000", transferGroupId: "g1" }),
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
    expect(slices).toEqual([{ categoryId: "cat-food", total: "1000.0000" }]);
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
      totalInstallments: 1,
      paidInstallments: 0,
      installmentAmount: null,
      ...over,
    }) as debts.Debt;

  it("resta el cupo ya usado: la deuda rotativa es deuda", () => {
    expect(netWorth([account({ creditUsed: "30000" })]).total).toBe("70000.0000");
  });

  it("resta un préstamo pendiente y suma lo que a mí me deben", () => {
    expect(netWorth([account()], [debt()]).total).toBe("50000.0000");
    expect(netWorth([account()], [debt({ direction: "OWED_TO_YOU" })]).total).toBe("150000.0000");
  });

  it("cuenta solo lo pendiente de una deuda pagada en parte", () => {
    const partial = debt({
      direction: "OWED_TO_YOU",
      principal: "200000",
      totalInstallments: 4,
      paidInstallments: 3,
    });
    expect(netWorth([account()], [partial]).total).toBe("150000.0000");
  });

  it("ignora deudas liquidadas y las de otra moneda", () => {
    expect(netWorth([account()], [debt({ settledAt: "2026-01-01T00:00:00.000Z" })]).total).toBe(
      "100000.0000",
    );
    expect(netWorth([account()], [debt({ currency: "USD" })]).total).toBe("100000.0000");
  });
});

describe("attentionItems", () => {
  // Tuesday 6 October 2026, local noon.
  const now = new Date(2026, 9, 6, 12);
  const day = (d: number) => new Date(2026, 9, d).toISOString();

  const statement = (over: Partial<accounts.CreditStatement> = {}): DueStatement => ({
    accountId: "acc-visa",
    accountName: "Visa Crédito",
    statement: {
      id: "st1",
      currency: "CLP",
      closedAt: day(1),
      dueDate: day(13),
      paidAt: null,
      transferredAt: null,
      remainingAmount: "612400",
      ...over,
    } as accounts.CreditStatement,
  });
  const payment = (over: Partial<UpcomingPayment> = {}): UpcomingPayment => ({
    id: "p1",
    label: "Notebook",
    date: day(9),
    amount: "54990",
    currency: "CLP",
    kind: "installment",
    inflow: false,
    ...over,
  });

  it("brings a statement due within a week, linked to its billing tab", () => {
    const [item] = attentionItems([statement()], [], now);
    expect(item).toMatchObject({ kind: "statement", amount: "612400", overdue: false });
    expect(item?.href).toBe("/accounts/acc-visa?tab=billing&statement=st1");
  });

  it("leaves out settled, still-open, far-off and fully paid statements", () => {
    const items = attentionItems(
      [
        statement({ paidAt: day(2) }),
        statement({ transferredAt: day(2) }),
        statement({ closedAt: null }),
        statement({ dueDate: day(30) }),
        statement({ remainingAmount: "0" }),
      ],
      [],
      now,
    );
    expect(items).toEqual([]);
  });

  it("brings payments due within 3 days, never money coming in", () => {
    const items = attentionItems(
      [],
      [
        payment(),
        payment({ id: "far", date: day(20) }),
        payment({ id: "in", kind: "debt", inflow: true }),
      ],
      now,
    );
    expect(items.map((i) => i.id)).toEqual(["p1"]);
    expect(items[0]?.href).toBe("/installments");
  });

  it("puts what is overdue first, then by date, and keeps at most three", () => {
    const items = attentionItems(
      [statement({ id: "late", dueDate: day(2) })],
      [
        payment({ id: "a", date: day(8) }),
        payment({ id: "b", date: day(7) }),
        payment({ id: "c", date: day(9) }),
      ],
      now,
    );
    expect(items.map((i) => i.id)).toEqual(["late", "b", "a"]);
    expect(items[0]?.overdue).toBe(true);
  });
});
