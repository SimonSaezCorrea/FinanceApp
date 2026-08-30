import { describe, expect, it } from "vitest";

import {
  BalanceCeilingExceededError,
  CardNotAllowedError,
  CardRequiredError,
} from "../../../../../src/domains/transaction/domain/errors";
import { MovementPolicy } from "../../../../../src/domains/transaction/domain/movement-policy";
import type { AccountContext } from "../../../../../src/domains/transaction/domain/movement-policy";

const creditAccount: AccountContext = {
  id: "aC",
  type: "CREDIT_CARD",
  currentBalance: "0",
  overdraftLimit: "0",
  balanceCeiling: null,
  creditLimit: "3000000",
  creditUsed: "0",
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
};

const charge = { type: "EXPENSE" as const, bankAccountId: "aC", amount: "12500", currency: "CLP" };

/**
 * Interest, an annual fee or insurance are applied by the ISSUER to the account.
 * No card made them, so the "a credit-line expense needs a card" rule would make
 * them unrecordable — and then the carried-over balance could never match the
 * bank's own figure.
 */
describe("MovementPolicy — finance charge", () => {
  it("accepts an issuer charge with no card and feeds the credit pool with it", () => {
    const contribution = MovementPolicy.validate(
      { ...charge, financeCharge: true },
      creditAccount,
      null,
      null,
      { income: "0", expense: "0" },
    );
    expect(contribution).toBe("12500");
  });

  it("still requires a card for an ordinary purchase on the same account", () => {
    expect(() =>
      MovementPolicy.validate(charge, creditAccount, null, null, { income: "0", expense: "0" }),
    ).toThrow(CardRequiredError);
  });

  it("refuses a card on a finance charge: nobody swiped anything", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...charge, financeCharge: true, cardId: "cC" },
        creditAccount,
        null,
        null,
        { income: "0", expense: "0" },
      ),
    ).toThrow(CardNotAllowedError);
  });

  it("reverts exactly what it contributed, so an edit or delete undoes it", () => {
    expect(
      MovementPolicy.contribution(
        { type: "EXPENSE", amount: "12500", financeCharge: true },
        creditAccount,
        null,
        null,
      ),
    ).toBe("12500");
  });

  it("contributes nothing on an account with no credit pool", () => {
    expect(
      MovementPolicy.contribution(
        { type: "EXPENSE", amount: "12500", financeCharge: true },
        { type: "CHECKING" },
        null,
        null,
      ),
    ).toBe("0");
  });
});

/** The mirror image of the overdraft: a capped account can't be filled past its cap. */
describe("MovementPolicy.assertWithinCeiling", () => {
  const capped = (balance: string, ceiling: string | null): AccountContext => ({
    ...creditAccount,
    type: "SIGHT",
    currentBalance: balance,
    balanceCeiling: ceiling,
  });

  it("accepts an income that lands exactly on the ceiling", () => {
    expect(() =>
      MovementPolicy.assertWithinCeiling(
        { type: "INCOME", amount: "400000" },
        capped("600000", "1000000"),
      ),
    ).not.toThrow();
  });

  it("refuses the one that goes past it", () => {
    expect(() =>
      MovementPolicy.assertWithinCeiling(
        { type: "INCOME", amount: "400001" },
        capped("600000", "1000000"),
      ),
    ).toThrow(BalanceCeilingExceededError);
  });

  it("does nothing without a declared ceiling, and never applies to an expense", () => {
    expect(() =>
      MovementPolicy.assertWithinCeiling({ type: "INCOME", amount: "99999999" }, capped("0", null)),
    ).not.toThrow();
    expect(() =>
      MovementPolicy.assertWithinCeiling(
        { type: "EXPENSE", amount: "99999999" },
        capped("0", "1000"),
      ),
    ).not.toThrow();
  });
});
