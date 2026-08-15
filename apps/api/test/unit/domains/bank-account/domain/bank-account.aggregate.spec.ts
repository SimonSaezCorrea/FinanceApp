import { describe, expect, it } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  AccountCannotHaveCardError,
  AccountNumberRequiredError,
  AccountTypeChangeNotAllowedError,
  CardKindNotAllowedError,
  CardLimitRequiredError,
  CardSubLimitExceedsAccountError,
  InvalidInitialBalanceError,
} from "../../../../../src/domains/bank-account/domain/errors";

function baseProps(overrides: Partial<BankAccountProps> = {}): BankAccountProps {
  return {
    id: "acc_1",
    userId: "u1",
    name: "My account",
    type: "CHECKING",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: "12345",
    initialBalance: "0",
    overdraftLimit: "0",
    currentBalance: "0",
    creditLimit: "0",
    creditUsedInitial: "0",
    creditUsed: "0",
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    minimumPaymentPercent: null,
    cards: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("BankAccount aggregate", () => {
  it("only CHECKING/SIGHT/CREDIT_CARD accounts can carry a card", () => {
    const cash = BankAccount.fromPersistence(baseProps({ type: "CASH", accountNumber: null }));
    expect(() => cash.assertCardable()).toThrow(AccountCannotHaveCardError);

    const checking = BankAccount.fromPersistence(baseProps({ type: "CHECKING" }));
    expect(() => checking.assertCardable()).not.toThrow();
  });

  it("requires accountNumber for CHECKING/SIGHT/SAVINGS", () => {
    const account = BankAccount.fromPersistence(baseProps({ type: "SAVINGS", accountNumber: "1" }));
    expect(() => account.applyUpdate({ accountNumber: "" })).toThrow(AccountNumberRequiredError);
    expect(() => account.applyUpdate({ accountNumber: "999" })).not.toThrow();
  });

  it("does not require accountNumber for CREDIT_CARD/INVESTMENT/CASH", () => {
    const account = BankAccount.fromPersistence(
      baseProps({ type: "CREDIT_CARD", accountNumber: null }),
    );
    expect(() => account.applyUpdate({ name: "x" })).not.toThrow();
  });

  it("the first CREDIT card becomes primary and mirrors the account's credit pool", () => {
    const account = BankAccount.fromPersistence(
      baseProps({ type: "CREDIT_CARD", creditLimit: "0" }),
    );
    const placement = account.resolveCardPlacement(
      {
        name: "Main credit card",
        kind: "CREDIT",
        last4: "1234",
        expiryMonth: 1,
        expiryYear: 2030,
        limits: [{ currency: "CLP", limitAmount: "500000" }],
      },
      null,
    );
    expect(placement.isPrimary).toBe(true);
    expect(placement.accountCreditLimit).toBe("500000");
    expect(placement.cardLimits).toEqual([]);
  });

  it("rejects a primary CREDIT card missing a limit in the account's own currency", () => {
    const account = BankAccount.fromPersistence(baseProps({ type: "CREDIT_CARD" }));
    expect(() =>
      account.resolveCardPlacement(
        { name: "c", kind: "CREDIT", last4: "1234", expiryMonth: 1, expiryYear: 2030, limits: [] },
        null,
      ),
    ).toThrow(CardLimitRequiredError);
  });

  it("an additional CREDIT card shares the account pool by default", () => {
    const account = BankAccount.fromPersistence(
      baseProps({
        type: "CREDIT_CARD",
        creditLimit: "500000",
        cards: [
          {
            id: "card_1",
            name: "Primary",
            kind: "CREDIT",
            last4: "1111",
            expiryMonth: 1,
            expiryYear: 2030,
            isActive: true,
            isPrimary: true,
            isVirtual: false,
            isAdditional: false,
            cardholderName: null,
            network: null,
            limits: [],
          },
        ],
      }),
    );
    const placement = account.resolveCardPlacement(
      { name: "Additional", kind: "CREDIT", last4: "2222", expiryMonth: 1, expiryYear: 2030 },
      null,
    );
    expect(placement.isPrimary).toBe(false);
    expect(placement.cardLimits).toEqual([]);
  });

  it("an additional CREDIT card's own sub-limit can't exceed the account pool (same currency)", () => {
    const account = BankAccount.fromPersistence(
      baseProps({
        type: "CREDIT_CARD",
        creditLimit: "100000",
        cards: [
          {
            id: "card_1",
            name: "Primary",
            kind: "CREDIT",
            last4: "1111",
            expiryMonth: 1,
            expiryYear: 2030,
            isActive: true,
            isPrimary: true,
            isVirtual: false,
            isAdditional: false,
            cardholderName: null,
            network: null,
            limits: [],
          },
        ],
      }),
    );
    expect(() =>
      account.resolveCardPlacement(
        {
          name: "Additional",
          kind: "CREDIT",
          last4: "2222",
          expiryMonth: 1,
          expiryYear: 2030,
          usesAccountPool: false,
          limits: [{ currency: "CLP", limitAmount: "200000" }],
        },
        null,
      ),
    ).toThrow(CardSubLimitExceedsAccountError);
  });

  it("adjustCreditUsed never takes creditUsed negative", () => {
    const account = BankAccount.fromPersistence(baseProps({ creditUsed: "100" }));
    account.adjustCreditUsed("-500");
    expect(account.creditUsed).toBe("0.0000");
  });

  it("setStatus emits AccountDeactivatedEvent only on a genuine ACTIVE -> INACTIVE transition", () => {
    const account = BankAccount.fromPersistence(baseProps({ status: "ACTIVE" }));
    const event = account.setStatus("INACTIVE");
    expect(event).not.toBeNull();
    expect(event?.accountId).toBe("acc_1");

    const again = account.setStatus("INACTIVE");
    expect(again).toBeNull();
  });

  // --- Prepaid account (spec 011) ---

  const prepaidCardInput = {
    name: "Prepago",
    kind: "PREPAID" as const,
    last4: "8890",
    expiryMonth: 3,
    expiryYear: 2030,
  };

  it("accepts a prepaid card on a prepaid account", () => {
    const account = BankAccount.fromPersistence(baseProps({ type: "PREPAID" }));
    // A placement answers only where the card sits (primary? own limits?) — the
    // descriptive fields ride along on the plan, not on this decision.
    expect(account.resolveCardPlacement(prepaidCardInput, null)).toEqual({
      isPrimary: false,
      cardLimits: [],
    });
  });

  it("refuses a card kind that doesn't belong on the account's type", () => {
    const prepaid = BankAccount.fromPersistence(baseProps({ type: "PREPAID" }));
    expect(() =>
      prepaid.resolveCardPlacement({ ...prepaidCardInput, kind: "DEBIT" }, null),
    ).toThrow(CardKindNotAllowedError);

    const checking = BankAccount.fromPersistence(baseProps({ type: "CHECKING" }));
    expect(() => checking.resolveCardPlacement(prepaidCardInput, null)).toThrow(
      CardKindNotAllowedError,
    );
  });

  it("still answers ACCOUNT_CANNOT_HAVE_CARD for a type that carries no cards at all", () => {
    const investment = BankAccount.fromPersistence(baseProps({ type: "INVESTMENT" }));
    expect(() => investment.resolveCardPlacement(prepaidCardInput, null)).toThrow(
      AccountCannotHaveCardError,
    );
  });

  it("gives a savings account its ATM debit card, and nothing else", () => {
    const savings = BankAccount.fromPersistence(baseProps({ type: "SAVINGS" }));
    expect(() =>
      savings.resolveCardPlacement({ ...prepaidCardInput, kind: "DEBIT" }, null),
    ).not.toThrow();
    expect(() =>
      savings.resolveCardPlacement({ ...prepaidCardInput, kind: "CREDIT" }, null),
    ).toThrow(CardKindNotAllowedError);
  });

  it("refuses a credit card on a checking account: it is its own credit-line account", () => {
    const checking2 = BankAccount.fromPersistence(baseProps({ type: "CHECKING" }));
    expect(() =>
      checking2.resolveCardPlacement({ ...prepaidCardInput, kind: "CREDIT" }, null),
    ).toThrow(CardKindNotAllowedError);
  });

  it("planCreation applies the same matrix to inline cards[]", () => {
    expect(() =>
      BankAccount.planCreation({
        type: "PREPAID",
        currency: "CLP",
        cards: [{ ...prepaidCardInput, kind: "DEBIT" }],
      }),
    ).toThrow(CardKindNotAllowedError);
    expect(
      BankAccount.planCreation({ type: "PREPAID", currency: "CLP", cards: [prepaidCardInput] })
        .cards,
    ).toHaveLength(1);
  });

  it("refuses a negative initial balance on a prepaid account only", () => {
    expect(() =>
      BankAccount.planCreation({ type: "PREPAID", currency: "CLP", initialBalance: "-1" }),
    ).toThrow(InvalidInitialBalanceError);
    // An overdrawn checking account is a real thing; only prepaid is bounded.
    expect(() =>
      BankAccount.planCreation({ type: "CHECKING", currency: "CLP", initialBalance: "-1" }),
    ).not.toThrow();
  });

  it("refuses to convert an account's type to or from PREPAID", () => {
    const prepaid = BankAccount.fromPersistence(baseProps({ type: "PREPAID" }));
    expect(() => prepaid.applyUpdate({ type: "CHECKING" })).toThrow(
      AccountTypeChangeNotAllowedError,
    );

    const checking = BankAccount.fromPersistence(baseProps({ type: "CHECKING" }));
    expect(() => checking.applyUpdate({ type: "PREPAID" })).toThrow(
      AccountTypeChangeNotAllowedError,
    );

    // Every other conversion is still allowed, and re-stating the same type is a no-op.
    expect(() => checking.applyUpdate({ type: "SIGHT" })).not.toThrow();
    expect(() => prepaid.applyUpdate({ type: "PREPAID", name: "Renamed" })).not.toThrow();
  });

  it("requires an accountNumber on a prepaid account (it is funded by transferring to it)", () => {
    const account = BankAccount.fromPersistence(baseProps({ type: "PREPAID" }));
    expect(() => account.applyUpdate({ accountNumber: "" })).toThrow(AccountNumberRequiredError);
  });
});
