import { describe, expect, it } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  AccountCannotHaveCardError,
  AccountNumberRequiredError,
  CardLimitRequiredError,
  CardSubLimitExceedsAccountError,
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
    currentBalance: "0",
    creditLimit: "0",
    creditUsedInitial: "0",
    creditUsed: "0",
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    cards: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("BankAccount aggregate", () => {
  it("only CHECKING/SIGHT/CREDIT_LINE accounts can carry a card", () => {
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

  it("does not require accountNumber for CREDIT_LINE/INVESTMENT/CASH", () => {
    const account = BankAccount.fromPersistence(
      baseProps({ type: "CREDIT_LINE", accountNumber: null }),
    );
    expect(() => account.applyUpdate({ name: "x" })).not.toThrow();
  });

  it("the first CREDIT card becomes primary and mirrors the account's credit pool", () => {
    const account = BankAccount.fromPersistence(
      baseProps({ type: "CREDIT_LINE", creditLimit: "0" }),
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
    const account = BankAccount.fromPersistence(baseProps({ type: "CREDIT_LINE" }));
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
        type: "CREDIT_LINE",
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
        type: "CREDIT_LINE",
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

  it("reconcileBalance = initialBalance + income - expense", () => {
    const account = BankAccount.fromPersistence(baseProps({ initialBalance: "1000" }));
    account.reconcileBalance("500", "200");
    expect(account.currentBalance).toBe("1300.0000");
  });

  it("setStatus emits AccountDeactivatedEvent only on a genuine ACTIVE -> INACTIVE transition", () => {
    const account = BankAccount.fromPersistence(baseProps({ status: "ACTIVE" }));
    const event = account.setStatus("INACTIVE");
    expect(event).not.toBeNull();
    expect(event?.accountId).toBe("acc_1");

    const again = account.setStatus("INACTIVE");
    expect(again).toBeNull();
  });
});
