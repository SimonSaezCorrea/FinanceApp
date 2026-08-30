import { describe, expect, it } from "vitest";

import {
  planDeletionReversal,
  type MovementAccount,
} from "../../../../src/domains/installment-plan/application/plan-deletion";

const checking: MovementAccount = { id: "aChecking", type: "CHECKING", currency: "CLP" };
const cash: MovementAccount = { id: "aCash", type: "CASH", currency: "CLP" };
const creditCard: MovementAccount = { id: "aCredit", type: "CREDIT_CARD", currency: "CLP" };

const accounts = new Map([checking, cash, creditCard].map((a) => [a.id, a]));

function expense(id: string, accountId: string | null, amount: string, financeCharge = false) {
  return { id, bankAccountId: accountId, type: "EXPENSE" as const, amount, financeCharge };
}

describe("planDeletionReversal", () => {
  it("gives back what each account paid, aggregated per account", () => {
    const result = planDeletionReversal(
      [
        expense("t1", "aChecking", "50000"),
        expense("t2", "aChecking", "50000"),
        expense("t3", "aCash", "20000"),
      ],
      accounts,
    );
    expect(result.movementIds).toEqual(["t1", "t2", "t3"]);
    expect(result.balanceRestorations).toEqual([
      { accountId: "aChecking", amount: "100000.0000", currency: "CLP" },
      { accountId: "aCash", amount: "20000.0000", currency: "CLP" },
    ]);
    expect(result.creditReversals).toEqual([]);
  });

  // The finance charge of a plan with interest sits on the credit-card account: it
  // never took cash out, so deleting it releases the pool, not a balance.
  it("releases the credit pool for a movement charged to credit", () => {
    const result = planDeletionReversal([expense("tI", "aCredit", "120000", true)], accounts);
    expect(result.balanceRestorations).toEqual([]);
    expect(result.creditReversals).toEqual([{ accountId: "aCredit", delta: "-120000.0000" }]);
  });

  // The movement still has to be deleted; there is simply no balance to restore.
  it("still deletes a movement whose account is gone", () => {
    const result = planDeletionReversal([expense("t9", null, "1000")], accounts);
    expect(result.movementIds).toEqual(["t9"]);
    expect(result.balanceRestorations).toEqual([]);
  });
});

// --- spec 014: the purchase movement (FR-006) ---

describe("planDeletionReversal with a plan's purchase movement", () => {
  it("releases the pool and restores no cash: a credit charge never took cash out", () => {
    // The purchase (1.080.000) plus the issuer's interest (5.000), both on the credit
    // account. Deleting the plan must give back exactly what creating it consumed —
    // and nothing to any cash balance, because none was ever touched (FR-002a).
    const result = planDeletionReversal(
      [expense("tPurchase", "aCredit", "1080000"), expense("tInterest", "aCredit", "5000", true)],
      accounts,
    );

    expect(result.balanceRestorations).toEqual([]);
    expect(result.creditReversals).toEqual([{ accountId: "aCredit", delta: "-1085000.0000" }]);
  });

  it("keeps a plan's cash instalments and its credit purchase in separate buckets", () => {
    // Cannot happen on one plan today (a CREDIT-card plan has no instalment payments),
    // but the classification must not depend on that: it is decided per movement, by
    // the account it sits on.
    const result = planDeletionReversal(
      [expense("tPurchase", "aCredit", "1080000"), expense("tInstalment", "aChecking", "90000")],
      accounts,
    );

    expect(result.creditReversals).toEqual([{ accountId: "aCredit", delta: "-1080000.0000" }]);
    expect(result.balanceRestorations).toEqual([
      { accountId: "aChecking", amount: "90000.0000", currency: "CLP" },
    ]);
  });
});
