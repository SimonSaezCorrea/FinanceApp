import { describe, expect, it } from "vitest";

import type { transactions } from "@finance/contracts";

import { balanceAfterTransaction } from "./balanceAfter";

const tx = (
  id: string,
  type: transactions.TransactionType,
  amount: string,
): transactions.Transaction => ({
  id,
  type,
  amount,
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
});

// Ordered newest first, exactly as the list renders them.
const items = [tx("t1", "EXPENSE", "1000"), tx("t2", "INCOME", "500"), tx("t3", "EXPENSE", "200")];

const debitCard = {
  id: "cD",
  name: "Débito",
  kind: "DEBIT" as const,
  last4: "1111",
  expiryMonth: 12,
  expiryYear: 2030,
  isActive: true,
  isPrimary: false,
  isVirtual: false,
  isAdditional: false,
  cardholderName: null,
  network: null,
  usesAccountPool: true,
  ownUsed: "0",
  limits: [],
};
const creditCard = { ...debitCard, id: "cC", name: "Crédito", kind: "CREDIT" as const };

const account = {
  type: "CHECKING" as const,
  currentBalance: "10000",
  cards: [debitCard, creditCard],
};

describe("balanceAfterTransaction", () => {
  it("returns the account's current balance for the newest movement", () => {
    expect(balanceAfterTransaction({ items, index: 0, account, dateFiltered: false })).toBe(
      "10000.0000",
    );
  });

  it("undoes the newer movements' deltas going back in time", () => {
    // After t2: current 10000 minus t1's delta (−1000) ⇒ 11000.
    expect(balanceAfterTransaction({ items, index: 1, account, dateFiltered: false })).toBe(
      "11000.0000",
    );
    // After t3: also undo t2's delta (+500) ⇒ 10500.
    expect(balanceAfterTransaction({ items, index: 2, account, dateFiltered: false })).toBe(
      "10500.0000",
    );
  });

  it("is null when a date filter is active (newer movements may be hidden)", () => {
    expect(balanceAfterTransaction({ items, index: 1, account, dateFiltered: true })).toBeNull();
  });

  it("is null for an account that carries no balance", () => {
    expect(
      balanceAfterTransaction({
        items,
        index: 0,
        account: { type: "CREDIT_CARD", currentBalance: "0", cards: [] },
        dateFiltered: false,
      }),
    ).toBeNull();
  });

  it("is null without an account", () => {
    expect(
      balanceAfterTransaction({ items, index: 0, account: undefined, dateFiltered: false }),
    ).toBeNull();
  });

  it("is null when the index is outside the loaded set", () => {
    expect(balanceAfterTransaction({ items, index: 9, account, dateFiltered: false })).toBeNull();
    expect(balanceAfterTransaction({ items, index: -1, account, dateFiltered: false })).toBeNull();
  });

  it("is null when a newer movement belongs to another account", () => {
    // A mixed list (the Movements view) can't tell what this account's balance
    // was: the deltas above the row aren't all its own.
    const mixed = [{ ...tx("x", "EXPENSE", "1000"), bankAccountId: "other" }, items[1]!];
    expect(
      balanceAfterTransaction({ items: mixed, index: 1, account, dateFiltered: false }),
    ).toBeNull();
  });

  it("ignores a newer purchase made with a CREDIT card: it moved no cash", () => {
    // The money leaves when the statement is paid, which is its own movement —
    // undoing it here too would show a balance that never existed.
    const withCredit = [{ ...tx("t0", "EXPENSE", "9000"), cardId: "cC" }, ...items];
    expect(
      balanceAfterTransaction({ items: withCredit, index: 1, account, dateFiltered: false }),
    ).toBe("10000.0000");
  });

  it("still undoes a purchase made with a DEBIT card", () => {
    const withDebit = [{ ...tx("t0", "EXPENSE", "9000"), cardId: "cD" }, ...items];
    expect(
      balanceAfterTransaction({ items: withDebit, index: 1, account, dateFiltered: false }),
    ).toBe("19000.0000");
  });

  it("is null when a card was used but the account's cards aren't loaded", () => {
    const withCard = [{ ...tx("t0", "EXPENSE", "9000"), cardId: "cC" }, ...items];
    expect(
      balanceAfterTransaction({
        items: withCard,
        index: 1,
        account: { ...account, cards: [] },
        dateFiltered: false,
      }),
    ).toBeNull();
  });
});
