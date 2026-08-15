import { describe, expect, it } from "vitest";

import { OverdraftLimitExceededError } from "../../../../../src/domains/transaction/domain/errors";
import { MovementPolicy } from "../../../../../src/domains/transaction/domain/movement-policy";
import type { AccountContext } from "../../../../../src/domains/transaction/domain/movement-policy";

const checking = (overrides: Partial<AccountContext> = {}): AccountContext => ({
  id: "a1",
  type: "CHECKING",
  currentBalance: "100000",
  overdraftLimit: "0",
  balanceCeiling: null,
  creditLimit: "0",
  creditUsed: "0",
  billingCycleDay: null,
  ...overrides,
});

const expense = (amount: string) => ({ type: "EXPENSE" as const, amount });

/**
 * The overdraft is the floor of a cash balance — the "línea de crédito" a bank
 * grants on a current account, which has no card and no statement of its own.
 */
describe("MovementPolicy.assertWithinOverdraft", () => {
  it("allows spending down to the granted line", () => {
    const account = checking({ currentBalance: "100000", overdraftLimit: "500000" });
    expect(() => MovementPolicy.assertWithinOverdraft(expense("600000"), account)).not.toThrow();
  });

  it("refuses the movement that would go past it", () => {
    const account = checking({ currentBalance: "100000", overdraftLimit: "500000" });
    expect(() => MovementPolicy.assertWithinOverdraft(expense("600001"), account)).toThrow(
      OverdraftLimitExceededError,
    );
  });

  it("stays silent when no line is configured, even below zero", () => {
    // Without a declared line the app has no basis to refuse: the bank may well
    // have allowed it, and the movement really happened.
    const account = checking({ currentBalance: "1000", overdraftLimit: "0" });
    expect(() => MovementPolicy.assertWithinOverdraft(expense("50000"), account)).not.toThrow();
  });

  it("never applies to income", () => {
    const account = checking({ currentBalance: "-400000", overdraftLimit: "500000" });
    expect(() =>
      MovementPolicy.assertWithinOverdraft({ type: "INCOME", amount: "999999" }, account),
    ).not.toThrow();
  });

  it("checks an edit against the balance BEFORE its own previous charge", () => {
    // The movement already took 400000 off; re-saving it at 450000 still fits.
    const account = checking({ currentBalance: "-350000", overdraftLimit: "500000" });
    expect(() =>
      MovementPolicy.assertWithinOverdraft(expense("450000"), account, "400000"),
    ).not.toThrow();
    expect(() =>
      MovementPolicy.assertWithinOverdraft(expense("600000"), account, "400000"),
    ).toThrow(OverdraftLimitExceededError);
  });
});
