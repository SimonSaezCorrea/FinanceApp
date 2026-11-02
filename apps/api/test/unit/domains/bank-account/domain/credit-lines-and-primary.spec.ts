import { describe, expect, it } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
  type CardProps,
} from "../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  CardLimitRequiredError,
  CardSubLimitExceedsAccountError,
  CreditPoolCurrencyNotFoundError,
  CreditPoolInUseError,
  CreditSettingsNotAllowedError,
  PrimaryCardInvalidReplacementError,
  PrimaryCardReplacementRequiredError,
} from "../../../../../src/domains/bank-account/domain/errors";

const card = (over: Partial<CardProps> = {}): CardProps => ({
  id: "c1",
  name: "Visa",
  kind: "CREDIT",
  last4: "1111",
  expiryMonth: 6,
  expiryYear: 2031,
  isActive: true,
  isPrimary: false,
  isVirtual: false,
  isAdditional: false,
  cardholderName: null,
  network: null,
  limits: [],
  ...over,
});

const usdLine = { id: "l1", currency: "USD", limitAmount: "3000", usedInitial: "0" };

function creditAccount(over: Partial<BankAccountProps> = {}): BankAccount {
  return BankAccount.fromPersistence({
    id: "acc_1",
    userId: "u1",
    name: "Visa BCI",
    type: "CREDIT_CARD",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: null,
    accountAlias: null,
    initialBalance: "0",
    overdraftLimit: "0",
    balanceCeiling: null,
    currentBalance: "0",
    creditLimit: "2000000",
    creditUsedInitial: "0",
    creditUsed: "100000",
    billingCycleDay: null,
    billingCycleType: "BUSINESS_DAY",
    paymentMethod: "MANUAL",
    paymentDueDay: null,
    paymentDueCycleType: "BUSINESS_DAY",
    minimumPaymentPercent: null,
    extraCreditLimits: [usdLine],
    cards: [
      card({ id: "p", isPrimary: true }),
      card({ id: "a", last4: "2222" }),
      card({ id: "x", last4: "3333", isActive: false }),
    ],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  });
}

describe("credit in other currencies (spec 039)", () => {
  it("a primary card never carries sub-limits, even rows left by older data", () => {
    const account = creditAccount({
      cards: [card({ id: "p", isPrimary: true, limits: [{ ...usdLine, id: "legacy" }] })],
    });
    expect(account.cards[0]!.limits).toEqual([]);
    expect(account.creditLineIn("USD")).toBe("3000");
    expect(account.creditLineIn("CLP")).toBe("2000000");
    expect(account.creditLineIn("EUR")).toBeNull();
  });

  it("planCreation: limits sent for the primary in another currency become the account's credit", () => {
    const planned = BankAccount.planCreation({
      type: "CREDIT_CARD",
      currency: "CLP",
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "1111",
          expiryMonth: 6,
          expiryYear: 2031,
          limits: [
            { currency: "CLP", limitAmount: "1000000" },
            { currency: "USD", limitAmount: "1500" },
          ],
        },
        {
          name: "Adicional",
          kind: "CREDIT",
          last4: "2222",
          expiryMonth: 6,
          expiryYear: 2031,
          usesAccountPool: false,
          limits: [{ currency: "USD", limitAmount: "500" }],
        },
      ],
    });
    expect(planned.creditLimit).toBe("1000000");
    expect(planned.extraCreditLimits).toEqual([
      { currency: "USD", limitAmount: "1500", usedInitial: "0" },
    ]);
    expect(planned.cards[0]!.cardLimits).toEqual([]);
    expect(planned.cards[1]!.cardLimits.map((l) => l.currency)).toEqual(["USD"]);
  });

  it("planCreation: an explicit account line wins over the primary's limit in that currency", () => {
    const planned = BankAccount.planCreation({
      type: "CREDIT_CARD",
      currency: "CLP",
      creditLimit: "900000",
      extraCreditLimits: [{ currency: "USD", limitAmount: "2000" }],
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "1111",
          expiryMonth: 6,
          expiryYear: 2031,
          limits: [{ currency: "USD", limitAmount: "1" }],
        },
      ],
    });
    // The primary needn't repeat the account's own-currency limit.
    expect(planned.creditLimit).toBe("900000");
    expect(planned.extraCreditLimits[0]!.limitAmount).toBe("2000");
  });

  it("a first credit card needs a limit only when the account has none", () => {
    const empty = creditAccount({ creditLimit: "0", cards: [] });
    expect(() =>
      empty.resolveCardPlacement(
        { name: "V", kind: "CREDIT", last4: "1111", expiryMonth: 1, expiryYear: 2030 },
        null,
      ),
    ).toThrow(CardLimitRequiredError);
    const withCredit = creditAccount({ cards: [] });
    const placement = withCredit.resolveCardPlacement(
      { name: "V", kind: "CREDIT", last4: "1111", expiryMonth: 1, expiryYear: 2030 },
      null,
    );
    expect(placement).toMatchObject({ isPrimary: true, accountCreditLimit: "2000000" });
  });

  it("setExtraCreditLimits replaces the set and refuses bad lines", () => {
    const account = creditAccount();
    account.setExtraCreditLimits([{ currency: "USD", limitAmount: "4000" }]);
    expect(account.extraCreditLimits).toEqual([
      { id: "l1", currency: "USD", limitAmount: "4000", usedInitial: "0" },
    ]);
    expect(() => account.setExtraCreditLimits([{ currency: "CLP", limitAmount: "1" }])).toThrow(
      CreditPoolCurrencyNotFoundError,
    );
    expect(() => account.setExtraCreditLimits([{ currency: "USD", limitAmount: "0" }])).toThrow(
      CreditPoolCurrencyNotFoundError,
    );
    const checking = creditAccount({ type: "CHECKING", extraCreditLimits: [] });
    expect(() => checking.setExtraCreditLimits([{ currency: "USD", limitAmount: "1" }])).toThrow(
      CreditSettingsNotAllowedError,
    );
  });

  it("mergeExtraCreditLimits only adds or updates", () => {
    const account = creditAccount();
    account.mergeExtraCreditLimits([{ currency: "CLF", limitAmount: "10" }]);
    expect(account.extraCreditLimits.map((l) => l.currency)).toEqual(["USD", "CLF"]);
  });
});

describe("sub-limits of additional cards (spec 039, US2)", () => {
  const input = (limits: { currency: string; limitAmount: string }[]) => ({
    name: "Adicional",
    kind: "CREDIT" as const,
    last4: "2222",
    expiryMonth: 6,
    expiryYear: 2031,
    usesAccountPool: false,
    limits,
  });

  it("accepts one within the account's credit in that currency", () => {
    const placement = creditAccount().resolveCardPlacement(
      input([{ currency: "USD", limitAmount: "500" }]),
      "a",
    );
    expect(placement.cardLimits.map((l) => l.currency)).toEqual(["USD"]);
  });

  it("refuses one above that credit, or in a currency the account has no credit in", () => {
    expect(() =>
      creditAccount().resolveCardPlacement(input([{ currency: "USD", limitAmount: "4000" }]), "a"),
    ).toThrow(CardSubLimitExceedsAccountError);
    expect(() =>
      creditAccount().resolveCardPlacement(input([{ currency: "EUR", limitAmount: "1" }]), "a"),
    ).toThrow(CreditPoolCurrencyNotFoundError);
  });

  it("refuses lowering or removing the account's credit below an existing sub-limit", () => {
    const account = creditAccount({
      cards: [
        card({ id: "p", isPrimary: true }),
        card({
          id: "a",
          limits: [{ id: "s1", currency: "USD", limitAmount: "500", usedInitial: "0" }],
        }),
      ],
    });
    expect(() => account.setExtraCreditLimits([{ currency: "USD", limitAmount: "400" }])).toThrow(
      CardSubLimitExceedsAccountError,
    );
    expect(() => account.setExtraCreditLimits([])).toThrow(CreditPoolInUseError);
  });
});

describe("changing the primary card (spec 039, US3/US4)", () => {
  it("swaps the roles and drops both cards' sub-limits, leaving the credit untouched", () => {
    const account = creditAccount({
      cards: [
        card({ id: "p", isPrimary: true }),
        card({
          id: "a",
          limits: [{ id: "s1", currency: "USD", limitAmount: "500", usedInitial: "0" }],
        }),
      ],
    });
    account.changePrimary("a");
    expect(account.cards.find((c) => c.id === "a")).toMatchObject({ isPrimary: true, limits: [] });
    expect(account.cards.find((c) => c.id === "p")).toMatchObject({ isPrimary: false, limits: [] });
    expect(account.creditLimit).toBe("2000000.0000");
    expect(account.creditUsed).toBe("100000.0000");
    expect(account.extraCreditLimits).toEqual([usdLine]);
  });

  it("refuses an inactive card or one that isn't on the account, and is a no-op on the primary", () => {
    const account = creditAccount();
    expect(() => account.changePrimary("x")).toThrow(PrimaryCardInvalidReplacementError);
    expect(() => account.changePrimary("nope")).toThrow(PrimaryCardInvalidReplacementError);
    account.changePrimary("p");
    expect(account.primaryCard?.id).toBe("p");
  });

  it("never deactivates or removes the active primary through a plain edit or delete", () => {
    const account = creditAccount();
    expect(() => account.assertCardUpdateKeepsPrimary("p", false)).toThrow(
      PrimaryCardReplacementRequiredError,
    );
    expect(() => account.assertCardRemovable("p")).toThrow(PrimaryCardReplacementRequiredError);
    expect(() => account.assertCardUpdateKeepsPrimary("a", false)).not.toThrow();
    expect(() => account.assertCardRemovable("a")).not.toThrow();
  });

  it("lets a primary that was already inactive be edited, so the account can be repaired", () => {
    const account = creditAccount({ cards: [card({ id: "p", isPrimary: true, isActive: false })] });
    expect(() => account.assertCardUpdateKeepsPrimary("p", false)).not.toThrow();
  });

  it("deactivates or detaches the former primary only once another one took its place", () => {
    const account = creditAccount();
    expect(() => account.deactivateCard("p")).toThrow(PrimaryCardReplacementRequiredError);
    account.changePrimary("a");
    account.deactivateCard("p");
    expect(account.cards.find((c) => c.id === "p")?.isActive).toBe(false);
    account.detachCard("p");
    expect(account.cards.map((c) => c.id)).toEqual(["a", "x"]);
  });
});
