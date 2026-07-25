import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { TransactionsService } from "./transactions.service";
import type { TransactionsRepository } from "./transactions.repository";

const row = {
  id: "t1",
  userId: "u1",
  bankAccountId: null,
  cardId: null,
  type: "EXPENSE" as const,
  amount: { toString: () => "33.3" },
  currency: "CLP",
  occurredAt: new Date("2026-03-01T00:00:00Z"),
  category: "food",
  description: null,
  observation: null,
  emisor: null,
  receptor: null,
  lugar: null,
  installmentPlanId: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
};

function makeService(repo: Partial<TransactionsRepository>) {
  // Every credit-pool check also probes for a per-card sub-limit; default to "none set".
  return new TransactionsService({
    findCardLimit: vi.fn().mockResolvedValue(null),
    findOrCreateOpenStatement: vi.fn().mockResolvedValue({ id: "stmt1" }),
    isStatementPaid: vi.fn().mockResolvedValue(false),
    ...repo,
  } as TransactionsRepository);
}

const creditAccount = {
  id: "aC",
  type: "CREDIT_LINE",
  currency: "CLP",
  creditLimit: { toString: () => "3000000" },
  creditUsed: { toString: () => "0" },
  billingSettings: { billingCycleDay: null as number | null },
};

const base = { currency: "CLP", occurredAt: "2026-03-01T00:00:00.000Z" };

describe("TransactionsService", () => {
  it("maps rows to the contract (amount fixed string)", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [tx] = await svc.list("u1", {});
    expect(tx.amount).toBe("33.3000");
    expect(tx.type).toBe("EXPENSE");
  });

  it("threads bankAccountId + cardId into the list where-clause (bank→card filter)", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    await svc.list("u1", { bankAccountId: "aC", cardId: "cS" });
    const where = list.mock.calls[0]![1] as { bankAccountId?: string; cardId?: string };
    expect(where.bankAccountId).toBe("aC");
    expect(where.cardId).toBe("cS");
  });

  it("throws NotFound when getting a missing transaction", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- Movement rules ---

  it("rejects an income linked to a card", async () => {
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CHECKING" }),
    });
    await expect(
      svc.create("u1", {
        ...base,
        type: "INCOME",
        amount: "1000",
        bankAccountId: "a1",
        cardId: "cP",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a card on a cash-account expense", async () => {
    const svc = makeService({ findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CASH" }) });
    await expect(
      svc.create("u1", {
        ...base,
        type: "EXPENSE",
        amount: "1000",
        bankAccountId: "a1",
        cardId: "cP",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires a card for a credit-line expense", async () => {
    const svc = makeService({ findAccount: vi.fn().mockResolvedValue(creditAccount) });
    await expect(
      svc.create("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "aC" }),
    ).rejects.toMatchObject({ response: { code: "CARD_REQUIRED" } });
  });

  it("rejects a card that does not belong to the account", async () => {
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue(null),
    });
    await expect(
      svc.create("u1", {
        ...base,
        type: "EXPENSE",
        amount: "1000",
        bankAccountId: "aC",
        cardId: "cP",
      }),
    ).rejects.toMatchObject({ response: { code: "CARD_ACCOUNT_MISMATCH" } });
  });

  it("throws NotFound when the bank account is not the user's", async () => {
    const svc = makeService({ findAccount: vi.fn().mockResolvedValue(null) });
    await expect(
      svc.create("u1", {
        ...base,
        type: "EXPENSE",
        amount: "1000",
        bankAccountId: "ghost",
        cardId: "cP",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("allows a cash expense with no card", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CASH" }),
      create,
    });
    await svc.create("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "a1" });
    expect(create).toHaveBeenCalled();
  });

  it("allows a checking expense without a card (card optional on non-credit accounts)", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CHECKING" }),
      create,
    });
    await svc.create("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "a1" });
    expect(create).toHaveBeenCalled();
  });

  // --- Credit-pool enforcement (account-level, persisted `creditUsed`) ---

  it("allows a credit-line expense within the pool and persists the increment", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const adjustCreditUsed = vi.fn();
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      adjustCreditUsed,
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "EXPENSE",
      amount: "100000",
      bankAccountId: "aC",
      cardId: "cC",
    });
    expect(create).toHaveBeenCalled();
    expect(adjustCreditUsed).toHaveBeenCalledWith("aC", "100000");
  });

  it("rejects a credit-line expense that exceeds the persisted pool", async () => {
    const svc = makeService({
      // used = 2,950,000; +100k = 3.05M > 3M
      findAccount: vi.fn().mockResolvedValue({ ...creditAccount, creditUsed: { toString: () => "2950000" } }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
    });
    await expect(
      svc.create("u1", {
        ...base,
        type: "EXPENSE",
        amount: "100000",
        bankAccountId: "aC",
        cardId: "cC",
      }),
    ).rejects.toMatchObject({ response: { code: "CARD_LIMIT_EXCEEDED" } });
  });

  it("counts credit payments (income) as decrementing the persisted pool", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const adjustCreditUsed = vi.fn();
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({ ...creditAccount, creditUsed: { toString: () => "2750000" } }),
      adjustCreditUsed,
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "INCOME",
      amount: "200000",
      bankAccountId: "aC",
    });
    expect(create).toHaveBeenCalled();
    expect(adjustCreditUsed).toHaveBeenCalledWith("aC", "-200000.0000");
  });

  // --- Update/delete: revert the old contribution, apply the new one ---

  it("throws NotFound updating a missing transaction", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.update("u1", "nope", { amount: "10" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("nets the old vs. new contribution to the same account on edit", async () => {
    const current = {
      ...row,
      id: "tX",
      bankAccountId: "aC",
      cardId: "cC",
      currency: "CLP",
      amount: { toString: () => "100000" },
    };
    const adjustCreditUsed = vi.fn();
    const update = vi.fn().mockResolvedValue({ ...current, amount: { toString: () => "250000" } });
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(current),
      // creditUsed already reflects the tx's own old 100,000 contribution.
      findAccount: vi.fn().mockResolvedValue({ ...creditAccount, creditUsed: { toString: () => "100000" } }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      adjustCreditUsed,
      update,
    });
    await svc.update("u1", "tX", { amount: "250000" });
    expect(update).toHaveBeenCalled();
    // net delta = new (250000) - old (100000) = 150000
    expect(adjustCreditUsed).toHaveBeenCalledWith("aC", "150000.0000");
  });

  it("reverts the transaction's contribution on delete", async () => {
    const current = {
      ...row,
      id: "tX",
      bankAccountId: "aC",
      cardId: "cC",
      currency: "CLP",
      type: "EXPENSE" as const,
      amount: { toString: () => "100000" },
    };
    const adjustCreditUsed = vi.fn();
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(current),
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      remove: vi.fn().mockResolvedValue(true),
      adjustCreditUsed,
    });
    await svc.remove("u1", "tX");
    expect(adjustCreditUsed).toHaveBeenCalledWith("aC", "-100000.0000");
  });

  // --- Per-card sub-limit enforcement (narrower than the account pool, still derived) ---

  it("allows a credit-line expense within both the account pool and the card's own sub-limit", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cSecondary", kind: "CREDIT" }),
      findCardLimit: vi.fn().mockResolvedValue({ limitAmount: { toString: () => "1000000" }, usedInitial: { toString: () => "0" } }),
      sumsForCard: vi.fn().mockResolvedValue({ income: "0", expense: "500000" }),
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "EXPENSE",
      amount: "100000",
      bankAccountId: "aC",
      cardId: "cSecondary",
    });
    expect(create).toHaveBeenCalled();
  });

  it("rejects an expense that fits the account pool but exceeds the card's own sub-limit", async () => {
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cSecondary", kind: "CREDIT" }),
      // sub-limit 1M, already used 950k → +100k = 1.05M > 1M
      findCardLimit: vi.fn().mockResolvedValue({ limitAmount: { toString: () => "1000000" }, usedInitial: { toString: () => "0" } }),
      sumsForCard: vi.fn().mockResolvedValue({ income: "0", expense: "950000" }),
    });
    await expect(
      svc.create("u1", {
        ...base,
        type: "EXPENSE",
        amount: "100000",
        bankAccountId: "aC",
        cardId: "cSecondary",
      }),
    ).rejects.toMatchObject({ response: { code: "CARD_SUBLIMIT_EXCEEDED" } });
  });

  it("enforces the account pool + card sub-limit for a CREDIT card on a non-credit-line account (e.g. checking)", async () => {
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({
        id: "a1",
        type: "CHECKING",
        creditLimit: { toString: () => "500000" },
        creditUsed: { toString: () => "450000" },
        billingSettings: { billingCycleDay: null },
      }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cCredit", kind: "CREDIT" }),
    });
    // account pool: 450k; +100k = 550k > 500k limit
    await expect(
      svc.create("u1", {
        ...base,
        type: "EXPENSE",
        amount: "100000",
        bankAccountId: "a1",
        cardId: "cCredit",
      }),
    ).rejects.toMatchObject({ response: { code: "CARD_LIMIT_EXCEEDED" } });
  });

  it("skips pool/sub-limit checks entirely for a DEBIT card on a checking account", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const adjustCreditUsed = vi.fn();
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({
        id: "a1",
        type: "CHECKING",
        creditLimit: { toString: () => "0" },
        creditUsed: { toString: () => "0" },
        billingSettings: { billingCycleDay: null },
      }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cDebit", kind: "DEBIT" }),
      adjustCreditUsed,
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "EXPENSE",
      amount: "1000000000",
      bankAccountId: "a1",
      cardId: "cDebit",
    });
    expect(create).toHaveBeenCalled();
    expect(adjustCreditUsed).not.toHaveBeenCalled();
  });
});
