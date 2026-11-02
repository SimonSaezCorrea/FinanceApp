import { describe, expect, it } from "vitest";

import {
  CardAccountMismatchError,
  CardLimitExceededError,
  CardNotAllowedError,
  CardRequiredError,
  CardSubLimitExceededError,
  CreditPoolCurrencyNotFoundError,
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
  currency: "CLP",
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

  describe("a movement in another currency on a credit card account (spec 039)", () => {
    const usdPool = (used = "0", limitAmount = "3000") => ({ pool: { limitAmount, used } });
    const usd = { currency: "USD", bankAccountId: "aC" };

    it("refuses it when the account has no credit in that currency", () => {
      expect(() =>
        MovementPolicy.validate(
          { ...usd, type: "EXPENSE", cardId: "cC", amount: "10" },
          creditAccount,
          creditCard,
          null,
          noUsage,
          "0",
          "0",
          { pool: null },
        ),
      ).toThrow(CreditPoolCurrencyNotFoundError);
      // Without any foreign context at all, the same refusal.
      expect(() =>
        MovementPolicy.validate(
          { ...usd, type: "EXPENSE", cardId: "cC", amount: "10" },
          creditAccount,
          creditCard,
          null,
          noUsage,
        ),
      ).toThrow(CreditPoolCurrencyNotFoundError);
    });

    it("charges the account's credit there, never the pesos pool, whichever card made it", () => {
      const contribution = MovementPolicy.validate(
        { ...usd, type: "EXPENSE", cardId: "cC", amount: "1000" },
        { ...creditAccount, creditUsed: "2999999" },
        creditCard,
        null,
        noUsage,
        "0",
        "0",
        usdPool("1000"),
      );
      expect(contribution).toBe("0");
    });

    it("refuses a charge past the account's credit there", () => {
      expect(() =>
        MovementPolicy.validate(
          { ...usd, type: "EXPENSE", cardId: "cC", amount: "200" },
          creditAccount,
          creditCard,
          null,
          noUsage,
          "0",
          "0",
          usdPool("2900"),
        ),
      ).toThrow(CardLimitExceededError);
    });

    it("caps an additional card by its sub-limit there even when the account has room", () => {
      expect(() =>
        MovementPolicy.validate(
          { ...usd, type: "EXPENSE", cardId: "cC", amount: "200" },
          creditAccount,
          creditCard,
          { limitAmount: "500", usedInitial: "0" },
          { income: "0", expense: "400" },
          "0",
          "0",
          usdPool("400"),
        ),
      ).toThrow(CardSubLimitExceededError);
    });

    it("refuses a charge that fits the sub-limit but not the account's credit", () => {
      expect(() =>
        MovementPolicy.validate(
          { ...usd, type: "EXPENSE", cardId: "cC", amount: "100" },
          creditAccount,
          creditCard,
          { limitAmount: "500", usedInitial: "0" },
          noUsage,
          "0",
          "0",
          usdPool("2950"),
        ),
      ).toThrow(CardLimitExceededError);
    });

    it("accepts an issuer charge there without a card", () => {
      expect(
        MovementPolicy.validate(
          { ...usd, type: "EXPENSE", amount: "5", financeCharge: true },
          creditAccount,
          null,
          null,
          noUsage,
          "0",
          "0",
          usdPool(),
        ),
      ).toBe("0");
    });

    it("takes a payment back with or without a card, leaving the pesos pool alone", () => {
      for (const cardId of ["cC", undefined]) {
        expect(
          MovementPolicy.validate(
            { ...usd, type: "INCOME", cardId, amount: "70" },
            { ...creditAccount, creditUsed: "50000" },
            cardId ? creditCard : null,
            null,
            noUsage,
            "0",
            "0",
            usdPool("80"),
          ),
        ).toBe("0");
      }
      expect(
        MovementPolicy.contribution(
          { type: "INCOME", amount: "70", currency: "USD" },
          creditAccount,
          creditCard,
          null,
        ),
      ).toBe("0");
    });
  });

  it("rejects an income with a credit card that has no own limit in that currency", () => {
    expect(() =>
      MovementPolicy.validate(
        { ...base, type: "INCOME", bankAccountId: "aC", cardId: "cC", amount: "1000" },
        creditAccount,
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
    // A sub-limit in the account's currency is carved out of the global cupo: the
    // card's spending still uses the account pool.
    expect(contribution).toBe("100000");
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

  it("counts a CREDIT card's own sub-limit in the account's currency toward the pool", () => {
    expect(
      MovementPolicy.contribution(
        { type: "EXPENSE", amount: "100", currency: "CLP" },
        creditAccount,
        creditCard,
        { limitAmount: "1", usedInitial: "0" },
      ),
    ).toBe("100");
  });

  it("is 0 for a charge against a card's limit in ANOTHER currency (its own pool)", () => {
    expect(
      MovementPolicy.contribution(
        { type: "EXPENSE", amount: "100", currency: "USD" },
        creditAccount,
        creditCard,
        { limitAmount: "1", usedInitial: "0" },
      ),
    ).toBe("0");
  });
});
