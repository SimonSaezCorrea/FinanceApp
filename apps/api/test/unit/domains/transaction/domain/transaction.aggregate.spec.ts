import { describe, expect, it } from "vitest";

import { Transaction } from "../../../../../src/domains/transaction/domain/transaction.aggregate";

describe("Transaction.planCreation", () => {
  it("forces cardId to null for INCOME regardless of what was passed in", () => {
    const plan = Transaction.planCreation({
      userId: "u1",
      type: "INCOME",
      amount: "1000",
      currency: "CLP",
      occurredAt: new Date("2026-01-01"),
      bankAccountId: "a1",
      cardId: "c1",
      creditStatementId: null,
    });
    expect(plan.cardId).toBeNull();
  });

  it("keeps cardId for EXPENSE", () => {
    const plan = Transaction.planCreation({
      userId: "u1",
      type: "EXPENSE",
      amount: "1000",
      currency: "CLP",
      occurredAt: new Date("2026-01-01"),
      bankAccountId: "a1",
      cardId: "c1",
      creditStatementId: "st1",
    });
    expect(plan.cardId).toBe("c1");
    expect(plan.creditStatementId).toBe("st1");
  });
});

describe("Transaction.applyUpdate", () => {
  function makeTx() {
    return Transaction.fromPersistence({
      id: "t1",
      userId: "u1",
      type: "EXPENSE",
      amount: "1000",
      currency: "CLP",
      occurredAt: new Date("2026-01-01"),
      category: null,
      description: null,
      observation: null,
      emisor: null,
      receptor: null,
      lugar: null,
      bankAccountId: "a1",
      cardId: "c1",
      installmentPlanId: null,
      transferGroupId: null,
      creditStatementId: "st1",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
  }

  it("drops the card when the effective type becomes INCOME", () => {
    const tx = makeTx();
    tx.applyUpdate({ type: "INCOME" });
    expect(tx.cardId).toBeNull();
  });

  it("updates amount/currency and leaves untouched fields alone", () => {
    const tx = makeTx();
    tx.applyUpdate({ amount: "2500" });
    expect(tx.amount).toBe("2500.0000");
    expect(tx.currency).toBe("CLP");
    expect(tx.bankAccountId).toBe("a1");
  });

  it("re-links creditStatementId when explicitly patched", () => {
    const tx = makeTx();
    tx.applyUpdate({ creditStatementId: null });
    expect(tx.creditStatementId).toBeNull();
  });
});
