import { describe, expect, it } from "vitest";

import {
  balanceDelta,
  cashDelta,
  isChargedToCredit,
  reverseCashDelta,
} from "../../../../../src/domains/transaction/domain/balance-delta";

const checking = { type: "CHECKING" } as const;
const creditLine = { type: "CREDIT_LINE" } as const;
const prepaid = { type: "PREPAID" } as const;
const debitCard = { kind: "DEBIT" } as const;
const creditCard = { kind: "CREDIT" } as const;
const prepaidCard = { kind: "PREPAID" } as const;

/**
 * The rule these tests pin down: what a movement COSTS and what it takes out of
 * the account are different questions. Buying on credit costs now and takes cash
 * later — once, when the statement is paid.
 */
describe("cashDelta", () => {
  it("moves the balance for an expense paid with cash or a debit card", () => {
    expect(cashDelta("EXPENSE", "50000", checking, null)).toBe(balanceDelta("EXPENSE", "50000"));
    expect(cashDelta("EXPENSE", "50000", checking, debitCard)).toBe(
      balanceDelta("EXPENSE", "50000"),
    );
  });

  it("moves the balance for a prepaid card, whose money lives in its account", () => {
    expect(cashDelta("EXPENSE", "12000", prepaid, prepaidCard)).toBe(
      balanceDelta("EXPENSE", "12000"),
    );
  });

  it("moves NO balance for an expense on a credit card of a bank account", () => {
    // The regression this guards: charging the account at purchase time AND
    // again when the statement is paid counted the same spending twice.
    expect(cashDelta("EXPENSE", "50000", checking, creditCard)).toBe("0");
  });

  it("moves no balance for any movement on a standalone credit-line account", () => {
    expect(cashDelta("EXPENSE", "50000", creditLine, creditCard)).toBe("0");
    // An income there is a card payment, not cash arriving in an account.
    expect(cashDelta("INCOME", "50000", creditLine, null)).toBe("0");
  });

  it("adds an income to the balance of an ordinary account", () => {
    expect(cashDelta("INCOME", "800000", checking, null)).toBe("800000");
  });

  it("reverses exactly what it applied, so an edit or a delete cancels out", () => {
    for (const card of [null, debitCard, creditCard]) {
      const applied = cashDelta("EXPENSE", "7500", checking, card);
      const reversed = reverseCashDelta("EXPENSE", "7500", checking, card);
      expect(Number(applied) + Number(reversed)).toBe(0);
    }
  });

  it("keeps the plain balanceDelta for movements with no account context", () => {
    // Transfers carry no card and are settled leg by leg.
    expect(cashDelta("EXPENSE", "1000", null, null)).toBe(balanceDelta("EXPENSE", "1000"));
  });
});

describe("isChargedToCredit", () => {
  it("is true for a credit card and for any movement on a credit-line account", () => {
    expect(isChargedToCredit(checking, creditCard)).toBe(true);
    expect(isChargedToCredit(creditLine, null)).toBe(true);
  });

  it("is false for cash, debit and prepaid", () => {
    expect(isChargedToCredit(checking, null)).toBe(false);
    expect(isChargedToCredit(checking, debitCard)).toBe(false);
    expect(isChargedToCredit(prepaid, prepaidCard)).toBe(false);
  });
});
