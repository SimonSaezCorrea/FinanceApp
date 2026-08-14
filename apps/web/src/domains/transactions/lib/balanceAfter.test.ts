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
  installmentPlanId: null,
  transferGroupId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

// Ordered newest first, exactly as the list renders them.
const items = [tx("t1", "EXPENSE", "1000"), tx("t2", "INCOME", "500"), tx("t3", "EXPENSE", "200")];

const account = { type: "CHECKING" as const, currentBalance: "10000" };

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
        account: { type: "CREDIT_LINE", currentBalance: "0" },
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
});
