import { describe, expect, it } from "vitest";

import { balanceDelta } from "../../../../../src/domains/transaction/domain/balance-delta";
import { PrepaidInsufficientBalanceError } from "../../../../../src/domains/transaction/domain/errors";
import {
  MovementPolicy,
  type AccountContext,
  type CardContext,
} from "../../../../../src/domains/transaction/domain/movement-policy";

/** A prepaid account holds its own provisioned funds: no credit line, and a
 * balance that can never go below zero. Its cards spend THAT balance. */
const prepaidAccount = (balance: string): AccountContext => ({
  id: "aP",
  type: "PREPAID",
  currentBalance: balance,
  creditLimit: "0",
  creditUsed: "0",
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
});

const checking: AccountContext = {
  id: "a1",
  type: "CHECKING",
  currentBalance: "1000",
  creditLimit: "0",
  creditUsed: "0",
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
};

const prepaidCard: CardContext = { id: "cP", kind: "PREPAID" };

const expense = (amount: string, cardId: string | null = "cP") => ({
  type: "EXPENSE" as const,
  bankAccountId: "aP",
  cardId,
  amount,
  currency: "CLP",
});

const noUsage = { income: "0", expense: "0" };

describe("PREPAID account: the balance lives in the account", () => {
  it("allows an expense up to the account's balance and never touches a credit pool", () => {
    expect(
      MovementPolicy.validate(
        expense("50000"),
        prepaidAccount("50000"),
        prepaidCard,
        null,
        noUsage,
      ),
    ).toBe("0");
  });

  it("rejects an expense bigger than the balance — a prepaid product declines, it doesn't lend", () => {
    expect(() =>
      MovementPolicy.validate(
        expense("50001"),
        prepaidAccount("50000"),
        prepaidCard,
        null,
        noUsage,
      ),
    ).toThrow(PrepaidInsufficientBalanceError);
  });

  it("bounds an expense with NO card too (money can leave by other channels)", () => {
    expect(() =>
      MovementPolicy.validate(expense("50001", null), prepaidAccount("50000"), null, null, noUsage),
    ).toThrow(PrepaidInsufficientBalanceError);
    expect(
      MovementPolicy.validate(expense("50000", null), prepaidAccount("50000"), null, null, noUsage),
    ).toBe("0");
  });

  it("allows an expense that leaves the balance exactly at zero", () => {
    expect(
      MovementPolicy.validate(
        expense("50000"),
        prepaidAccount("50000"),
        prepaidCard,
        null,
        noUsage,
      ),
    ).toBe("0");
  });

  it("checks an edit against the balance BEFORE this movement's own old charge", () => {
    // The account holds 10000 after a 40000 expense; re-saving that same movement
    // at 45000 must fit 50000, not 10000.
    expect(() =>
      MovementPolicy.validate(
        expense("45000"),
        prepaidAccount("10000"),
        prepaidCard,
        null,
        noUsage,
        "0",
        "40000",
      ),
    ).not.toThrow();
    expect(() =>
      MovementPolicy.validate(
        expense("50001"),
        prepaidAccount("10000"),
        prepaidCard,
        null,
        noUsage,
        "0",
        "40000",
      ),
    ).toThrow(PrepaidInsufficientBalanceError);
  });

  it("never bounds an INCOME", () => {
    expect(
      MovementPolicy.validate(
        { type: "INCOME", bankAccountId: "aP", amount: "999999", currency: "CLP" },
        prepaidAccount("0"),
        null,
        null,
        noUsage,
      ),
    ).toBe("0");
  });

  it("leaves other account types unbounded (a checking account may go negative)", () => {
    expect(
      MovementPolicy.validate(
        { ...expense("999999", null), bankAccountId: "a1" },
        checking,
        null,
        null,
        noUsage,
      ),
    ).toBe("0");
  });

  it("moves the account's balance like any other expense (the card holds no money)", () => {
    expect(balanceDelta("EXPENSE", "50000")).toBe("-50000.0000");
    expect(balanceDelta("INCOME", "50000")).toBe("50000");
  });
});
