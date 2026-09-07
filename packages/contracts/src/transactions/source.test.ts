import { describe, expect, it } from "vitest";

import { sourceOf, type Transaction } from "./index";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  type: "EXPENSE",
  amount: "1000",
  currency: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
  category: null,
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
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("sourceOf", () => {
  it("is MANUAL when nothing links the movement anywhere", () => {
    expect(sourceOf(tx())).toEqual({ kind: "MANUAL" });
  });

  it("is TRANSFER when it carries a transferGroupId, regardless of other fields", () => {
    expect(sourceOf(tx({ transferGroupId: "g1" }))).toEqual({ kind: "TRANSFER" });
    expect(sourceOf(tx({ transferGroupId: "g1", debtId: "d1" }))).toEqual({ kind: "TRANSFER" });
  });

  it("is INSTALLMENT for a plan's ordinary instalment expense", () => {
    expect(sourceOf(tx({ installmentPlanId: "p1" }))).toEqual({
      kind: "INSTALLMENT",
      installmentPlanId: "p1",
    });
  });

  it("is INSTALLMENT_INTEREST for a plan's interest charge, not FINANCE_CHARGE", () => {
    expect(sourceOf(tx({ installmentPlanId: "p1", financeCharge: true }))).toEqual({
      kind: "INSTALLMENT_INTEREST",
      installmentPlanId: "p1",
    });
  });

  it("is FINANCE_CHARGE for an issuer charge with no plan behind it", () => {
    expect(sourceOf(tx({ financeCharge: true }))).toEqual({ kind: "FINANCE_CHARGE" });
  });

  it("is DEBT when it carries a debtId and nothing else claims it first", () => {
    expect(sourceOf(tx({ debtId: "d1" }))).toEqual({ kind: "DEBT", debtId: "d1" });
  });
});
