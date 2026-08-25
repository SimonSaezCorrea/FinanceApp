import { describe, expect, it } from "vitest";

import {
  CardAccountMismatchError,
  CardLimitExceededError,
  CardNotAllowedError,
  CardRequiredError,
  CardSubLimitExceededError,
} from "../../../../../src/domains/transaction/domain/errors";
import { MovementPolicy } from "../../../../../src/domains/transaction/domain/movement-policy";
import type {
  AccountContext,
  CardContext,
  CardLimitContext,
} from "../../../../../src/domains/transaction/domain/movement-policy";

const cashAccount: AccountContext = {
  id: "a1",
  type: "CASH",
  currentBalance: "1000000",
  creditLimit: "0",
  creditUsed: "0",
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
};

const checkingAccount: AccountContext = {
  id: "a1",
  type: "CHECKING",
  currentBalance: "1000000",
  creditLimit: "0",
  creditUsed: "0",
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
};

const creditAccount: AccountContext = {
  id: "aC",
  type: "CREDIT_CARD",
  currentBalance: "1000000",
  creditLimit: "3000000",
  creditUsed: "0",
  billingCycleDay: null,
  billingCycleType: "BUSINESS_DAY",
};

const creditCard: CardContext = { id: "cC", kind: "CREDIT" };
const debitCard: CardContext = { id: "cD", kind: "DEBIT" };
const noUsage = { income: "0", expense: "0" };

const base = { currency: "CLP" };

describe("MovementPolicy.validate", () => {
  it("rejects an income linked to a card", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "INCOME", bankAccountId: "a1", cardId: "cP", amount: "1000" },
        checkingAccount,
        creditCard,
        null,
        noUsage,
      ),
    ).toThrow(CardNotAllowedError);
  });

  it("rejects a card on a cash-account expense", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "a1", cardId: "cP", amount: "1000" },
        cashAccount,
        creditCard,
        null,
        noUsage,
      ),
    ).toThrow(CardNotAllowedError);
  });

  it("requires a card for a credit-line expense", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "aC", amount: "1000" },
        creditAccount,
        null,
        null,
        noUsage,
      ),
    ).toThrow(CardRequiredError);
  });

  it("rejects a card that does not belong to the account", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "aC", cardId: "cP", amount: "1000" },
        creditAccount,
        null,
        null,
        noUsage,
      ),
    ).toThrow(CardAccountMismatchError);
  });

  it("allows a cash expense with no card", () => {
    expect(
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "a1", amount: "1000" },
        cashAccount,
        null,
        null,
        noUsage,
      ),
    ).toBe("0");
  });

  it("allows a checking expense without a card (card optional on non-credit accounts)", () => {
    expect(
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "a1", amount: "1000" },
        checkingAccount,
        null,
        null,
        noUsage,
      ),
    ).toBe("0");
  });

  it("allows a credit-line expense within the pool and returns the contribution", () => {
    const contribution = MovementPolicy.validate(
      { ...base, type: "EXPENSE", bankAccountId: "aC", cardId: "cC", amount: "100000" },
      creditAccount,
      creditCard,
      null,
      noUsage,
    );
    expect(contribution).toBe("100000");
  });

  it("rejects a credit-line expense that exceeds the persisted pool", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "aC", cardId: "cC", amount: "100000" },
        { ...creditAccount, creditUsed: "2950000" },
        creditCard,
        null,
        noUsage,
      ),
    ).toThrow(CardLimitExceededError);
  });

  it("counts credit payments (income) as a negative contribution", () => {
    const contribution = MovementPolicy.validate(
      { ...base, type: "INCOME", bankAccountId: "aC", amount: "200000" },
      { ...creditAccount, creditUsed: "2750000" },
      null,
      null,
      noUsage,
    );
    expect(contribution).toBe("-200000.0000");
  });

  it("allows a credit-line expense within both the account pool and the card's own sub-limit", () => {
    const limit: CardLimitContext = { limitAmount: "1000000", usedInitial: "0" };
    const contribution = MovementPolicy.validate(
      { ...base, type: "EXPENSE", bankAccountId: "aC", cardId: "cSecondary", amount: "100000" },
      creditAccount,
      { id: "cSecondary", kind: "CREDIT" },
      limit,
      { income: "0", expense: "500000" },
    );
    expect(contribution).toBe("0"); // has its own sub-limit -> stays out of the account pool
  });

  it("rejects an expense that fits the account pool but exceeds the card's own sub-limit", () => {
    const limit: CardLimitContext = { limitAmount: "1000000", usedInitial: "0" };
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "aC", cardId: "cSecondary", amount: "100000" },
        creditAccount,
        { id: "cSecondary", kind: "CREDIT" },
        limit,
        { income: "0", expense: "950000" },
      ),
    ).toThrow(CardSubLimitExceededError);
  });

  it("enforces the account pool + card sub-limit for a CREDIT card on a non-credit-line account (e.g. checking)", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "EXPENSE", bankAccountId: "a1", cardId: "cCredit", amount: "100000" },
        { ...checkingAccount, creditLimit: "500000", creditUsed: "450000" },
        { id: "cCredit", kind: "CREDIT" },
        null,
        noUsage,
      ),
    ).toThrow(CardLimitExceededError);
  });

  it("skips pool/sub-limit checks entirely for a DEBIT card on a checking account", () => {
    const contribution = MovementPolicy.validate(
      { ...base, type: "EXPENSE", bankAccountId: "a1", cardId: "cDebit", amount: "1000000000" },
      checkingAccount,
      debitCard,
      null,
      noUsage,
    );
    expect(contribution).toBe("0");
  });
});

describe("MovementPolicy.contribution", () => {
  it("is 0 for a CASH account regardless of type", () => {
    expect(
      MovementPolicy.contribution({ type: "EXPENSE", amount: "100" }, cashAccount, null, null),
    ).toBe("0");
  });

  it("is the negative amount for INCOME on a CREDIT_CARD account", () => {
    expect(
      MovementPolicy.contribution({ type: "INCOME", amount: "100" }, creditAccount, null, null),
    ).toBe("-100.0000");
  });

  it("is 0 for INCOME on a non-credit-line account", () => {
    expect(
      MovementPolicy.contribution({ type: "INCOME", amount: "100" }, checkingAccount, null, null),
    ).toBe("0");
  });

  it("is 0 without a CREDIT card", () => {
    expect(
      MovementPolicy.contribution(
        { type: "EXPENSE", amount: "100" },
        creditAccount,
        debitCard,
        null,
      ),
    ).toBe("0");
  });

  it("is 0 for a CREDIT card with its own sub-limit (stays out of the shared pool)", () => {
    expect(
      MovementPolicy.contribution({ type: "EXPENSE", amount: "100" }, creditAccount, creditCard, {
        limitAmount: "1",
        usedInitial: "0",
      }),
    ).toBe("0");
  });
});
