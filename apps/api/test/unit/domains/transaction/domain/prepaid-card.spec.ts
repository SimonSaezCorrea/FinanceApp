import { describe, expect, it } from "vitest";

import {
  accountBalanceDelta,
  balanceDelta,
} from "../../../../../src/domains/transaction/domain/balance-delta";
import { PrepaidInsufficientBalanceError } from "../../../../../src/domains/transaction/domain/errors";
import {
  MovementPolicy,
  type AccountContext,
  type CardContext,
} from "../../../../../src/domains/transaction/domain/movement-policy";

const checking: AccountContext = {
  id: "a1",
  type: "CHECKING",
  creditLimit: "0",
  creditUsed: "0",
  billingCycleDay: null,
};

const prepaid = (balance: string): CardContext => ({
  id: "cP",
  kind: "PREPAID",
  prepaidBalance: balance,
});

const expense = (amount: string) => ({
  type: "EXPENSE" as const,
  bankAccountId: "a1",
  cardId: "cP",
  amount,
  currency: "CLP",
});

const noUsage = { income: "0", expense: "0" };

describe("PREPAID cards: the card's own pot", () => {
  it("allows an expense up to what the card holds and never touches the credit pool", () => {
    expect(
      MovementPolicy.validate(expense("50000"), checking, prepaid("50000"), null, noUsage),
    ).toBe("0");
  });

  it("rejects an expense bigger than the balance — a prepaid card declines, it doesn't lend", () => {
    expect(() =>
      MovementPolicy.validate(expense("50001"), checking, prepaid("50000"), null, noUsage),
    ).toThrow(PrepaidInsufficientBalanceError);
  });

  it("checks an edit against the balance BEFORE this movement's own old charge", () => {
    // The card holds 10000 after a 40000 charge; re-saving that same movement at
    // 45000 must fit 50000, not 10000.
    expect(() =>
      MovementPolicy.validate(
        expense("45000"),
        checking,
        prepaid("10000"),
        null,
        noUsage,
        "0",
        "40000",
      ),
    ).not.toThrow();
  });

  it("draws the card's pot down, and leaves the ACCOUNT's balance alone", () => {
    expect(
      MovementPolicy.prepaidDelta({ type: "EXPENSE", amount: "50000" }, prepaid("50000")),
    ).toBe("-50000.0000");
    // The money left the account when the card was loaded — counting it here too
    // would subtract the same money twice.
    expect(accountBalanceDelta("EXPENSE", "50000", "PREPAID")).toBe("0");
    expect(accountBalanceDelta("EXPENSE", "50000", "DEBIT")).toBe(balanceDelta("EXPENSE", "50000"));
  });
});
