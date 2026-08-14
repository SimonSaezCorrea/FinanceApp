import { describe, expect, it } from "vitest";

import { projectedAfterSave, projectedBalance } from "./projectedBalance";

const account = {
  id: "a1",
  type: "CHECKING" as const,
  currentBalance: "10000",
  creditLimit: "0",
  creditUsed: "0",
};

const creditLine = {
  id: "c1",
  type: "CREDIT_LINE" as const,
  currentBalance: "0",
  creditLimit: "500000",
  creditUsed: "100000",
};

describe("projectedAfterSave — cash accounts", () => {
  it("subtracts an expense and adds an income", () => {
    expect(projectedAfterSave({ account, type: "EXPENSE", amount: "1000" })).toEqual({
      kind: "balance",
      amount: "9000.0000",
    });
    expect(projectedAfterSave({ account, type: "INCOME", amount: "1000" })).toEqual({
      kind: "balance",
      amount: "11000.0000",
    });
  });

  it("undoes the original movement's effect when editing", () => {
    // The 500 expense is already in currentBalance; raising it to 800 should
    // read 10000 + 500 − 800.
    expect(
      projectedBalance({
        account,
        type: "EXPENSE",
        amount: "800",
        original: { type: "EXPENSE", amount: "500", bankAccountId: "a1" },
      }),
    ).toBe("9700.0000");
  });

  it("does not undo anything when the movement came from another account", () => {
    expect(
      projectedBalance({
        account,
        type: "EXPENSE",
        amount: "800",
        original: { type: "EXPENSE", amount: "500", bankAccountId: "other" },
      }),
    ).toBe("9200.0000");
  });

  it("handles flipping expense to income while editing", () => {
    expect(
      projectedBalance({
        account,
        type: "INCOME",
        amount: "500",
        original: { type: "EXPENSE", amount: "500", bankAccountId: "a1" },
      }),
    ).toBe("11000.0000");
  });

  it("is null without an account or a usable amount", () => {
    expect(projectedAfterSave({ account: undefined, type: "EXPENSE", amount: "100" })).toBeNull();
    expect(projectedAfterSave({ account, type: "EXPENSE", amount: "" })).toBeNull();
  });
});

describe("projectedAfterSave — credit", () => {
  it("an expense on a credit line eats into the AVAILABLE CREDIT, not a balance", () => {
    expect(projectedAfterSave({ account: creditLine, type: "EXPENSE", amount: "50000" })).toEqual({
      kind: "credit",
      // 500.000 limit − (100.000 already used + 50.000) = 350.000 available.
      amount: "350000.0000",
    });
  });

  it("income on a credit line is a payment: it gives credit back", () => {
    expect(projectedAfterSave({ account: creditLine, type: "INCOME", amount: "40000" })).toEqual({
      kind: "credit",
      amount: "440000.0000",
    });
  });

  it("a CREDIT card on an ordinary account draws on the pool too", () => {
    const checkingWithPool = { ...account, creditLimit: "300000", creditUsed: "20000" };
    expect(
      projectedAfterSave({
        account: checkingWithPool,
        type: "EXPENSE",
        amount: "30000",
        card: { kind: "CREDIT" },
      }),
    ).toEqual({ kind: "credit", amount: "250000.0000" });
  });

  it("a DEBIT card on the same account still moves the balance", () => {
    expect(
      projectedAfterSave({
        account,
        type: "EXPENSE",
        amount: "1000",
        card: { kind: "DEBIT" },
      }),
    ).toEqual({ kind: "balance", amount: "9000.0000" });
  });

  it("projectedBalance reports nothing for a credit-drawn movement", () => {
    expect(projectedBalance({ account: creditLine, type: "EXPENSE", amount: "1000" })).toBeNull();
  });
});
