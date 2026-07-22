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
    ...repo,
  } as TransactionsRepository);
}

const creditAccount = {
  id: "aC",
  type: "CREDIT_LINE",
  currency: "CLP",
  creditLimit: "3000000",
  creditUsedInitial: "0",
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

  // --- Credit-pool enforcement (account-level) ---

  it("allows a credit-line expense within the pool", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      sumsForAccount: vi.fn().mockResolvedValue({ income: "0", expense: "0" }),
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
  });

  it("scopes the shared-pool sum to the account's own currency (a card can pool-share in one currency while independent in another)", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const sumsForAccount = vi.fn().mockResolvedValue({ income: "0", expense: "0" });
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      sumsForAccount,
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "EXPENSE",
      amount: "100000",
      bankAccountId: "aC",
      cardId: "cC",
    });
    expect(sumsForAccount.mock.calls[0]![2]).toBe("CLP"); // account.currency
  });

  it("passes the account type through, and scopes to the current billing cycle when the account has one configured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00Z"));
    const create = vi.fn().mockResolvedValue(row);
    const sumsForAccount = vi.fn().mockResolvedValue({ income: "0", expense: "0" });
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({ ...creditAccount, billingCycleDay: 15 }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      sumsForAccount,
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "EXPENSE",
      amount: "100000",
      bankAccountId: "aC",
      cardId: "cC",
    });
    expect(sumsForAccount.mock.calls[0]![3]).toBe("CREDIT_LINE"); // account.type
    const since = sumsForAccount.mock.calls[0]![4] as Date;
    expect(since.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    vi.useRealTimers();
  });

  it("leaves the sum all-time (no cycle) when the account has no billing day configured", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const sumsForAccount = vi.fn().mockResolvedValue({ income: "0", expense: "0" });
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      sumsForAccount,
      create,
    });
    await svc.create("u1", {
      ...base,
      type: "EXPENSE",
      amount: "100000",
      bankAccountId: "aC",
      cardId: "cC",
    });
    expect(sumsForAccount.mock.calls[0]![4]).toBeNull();
  });

  it("rejects a credit-line expense that exceeds the pool", async () => {
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      // used = 0 + 2,950,000 − 0 = 2.95M; +100k = 3.05M > 3M
      sumsForAccount: vi.fn().mockResolvedValue({ income: "0", expense: "2950000" }),
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

  it("counts credit payments (income) as reducing the used pool", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      // used = 0 + 2,950,000 − 200,000 = 2.75M; +100k = 2.85M ≤ 3M → ok
      sumsForAccount: vi.fn().mockResolvedValue({ income: "200000", expense: "2950000" }),
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
  });

  // --- Update: re-enforce excluding the edited tx ---

  it("throws NotFound updating a missing transaction", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.update("u1", "nope", { amount: "10" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("re-enforces on edit excluding the edited tx's own contribution", async () => {
    const current = {
      ...row,
      id: "tX",
      bankAccountId: "aC",
      cardId: "cC",
      currency: "CLP",
      amount: { toString: () => "100000" },
    };
    const sumsForAccount = vi.fn().mockResolvedValue({ income: "0", expense: "0" });
    const update = vi.fn().mockResolvedValue({ ...current, amount: { toString: () => "250000" } });
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(current),
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      sumsForAccount,
      update,
    });
    await svc.update("u1", "tX", { amount: "250000" });
    expect(sumsForAccount.mock.calls[0]![5]).toBe("tX"); // excludeTxId
    expect(update).toHaveBeenCalled();
  });

  // --- Per-card sub-limit enforcement (narrower than the account pool) ---

  it("allows a credit-line expense within both the account pool and the card's own sub-limit", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cSecondary", kind: "CREDIT" }),
      sumsForAccount: vi.fn().mockResolvedValue({ income: "0", expense: "0" }),
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
      sumsForAccount: vi.fn().mockResolvedValue({ income: "0", expense: "0" }),
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
      findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CHECKING", creditLimit: "500000", creditUsedInitial: "0" }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cCredit", kind: "CREDIT" }),
      sumsForAccount: vi.fn().mockResolvedValue({ income: "0", expense: "450000" }),
    });
    // account pool: 0 + 450,000 = 450k; +100k = 550k > 500k limit
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
    const sumsForAccount = vi.fn();
    const svc = makeService({
      findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CHECKING", creditLimit: "0", creditUsedInitial: "0" }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cDebit", kind: "DEBIT" }),
      sumsForAccount,
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
    expect(sumsForAccount).not.toHaveBeenCalled();
  });
});
