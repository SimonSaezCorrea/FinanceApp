import { describe, expect, it, vi } from "vitest";

import { CreateTransactionHandler } from "../../../../../../src/domains/transactions/application/commands/create-transaction.handler";
import { CreateTransactionCommand } from "../../../../../../src/domains/transactions/application/commands/create-transaction.command";
import { AccountNotFoundError, CardAccountMismatchError, CardLimitExceededError, CardRequiredError } from "../../../../../../src/domains/transactions/domain/errors";
import { Transaction } from "../../../../../../src/domains/transactions/domain/transaction.aggregate";
import type { TransactionRepositoryPort } from "../../../../../../src/domains/transactions/domain/ports/transaction.repository.port";

function fakeRepo(overrides: Partial<TransactionRepositoryPort> = {}): TransactionRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    findAccount: vi.fn(),
    findCardInAccount: vi.fn(),
    findCardLimit: vi.fn().mockResolvedValue(null),
    sumsForCard: vi.fn(),
    findOrCreateOpenStatement: vi.fn().mockResolvedValue({ id: "stmt1" }),
    isStatementPaid: vi.fn().mockResolvedValue(false),
    saveNew: vi.fn(),
    saveUpdate: vi.fn(),
    removeWithCreditAdjustment: vi.fn(),
    ...overrides,
  };
}

const base = { currency: "CLP", occurredAt: "2026-03-01T00:00:00.000Z" } as const;

const creditAccount = {
  id: "aC",
  type: "CREDIT_LINE" as const,
  creditLimit: "3000000",
  creditUsed: "0",
  billingCycleDay: null,
};

function makeHandler(repo: TransactionRepositoryPort) {
  return new CreateTransactionHandler({ publish: vi.fn() } as never, repo);
}

describe("CreateTransactionHandler", () => {
  it("throws AccountNotFoundError when the bank account is not the user's", async () => {
    const repo = fakeRepo({ findAccount: vi.fn().mockResolvedValue(null) });
    const handler = makeHandler(repo);
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "ghost", cardId: "cP" }),
      ),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it("requires a card for a credit-line expense", async () => {
    const repo = fakeRepo({ findAccount: vi.fn().mockResolvedValue(creditAccount) });
    const handler = makeHandler(repo);
    await expect(
      handler.execute(new CreateTransactionCommand("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "aC" })),
    ).rejects.toBeInstanceOf(CardRequiredError);
  });

  it("rejects a card that does not belong to the account", async () => {
    const repo = fakeRepo({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue(null),
    });
    const handler = makeHandler(repo);
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "aC", cardId: "cP" }),
      ),
    ).rejects.toBeInstanceOf(CardAccountMismatchError);
  });

  it("allows a credit-line expense within the pool, links the OPEN statement, and persists atomically", async () => {
    const saveNew = vi.fn().mockImplementation(async (userId, plan) =>
      Transaction.fromPersistence({
        id: "t1",
        userId,
        ...plan,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const repo = fakeRepo({
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      saveNew,
    });
    const handler = makeHandler(repo);
    const result = await handler.execute(
      new CreateTransactionCommand("u1", { ...base, type: "EXPENSE", amount: "100000", bankAccountId: "aC", cardId: "cC" }),
    );
    expect(result.id).toBe("t1");
    expect(saveNew).toHaveBeenCalledWith("u1", expect.objectContaining({ creditStatementId: "stmt1" }), {
      accountId: "aC",
      delta: "100000",
    });
  });

  it("rejects a credit-line expense that exceeds the persisted pool", async () => {
    const repo = fakeRepo({
      findAccount: vi.fn().mockResolvedValue({ ...creditAccount, creditUsed: "2950000" }),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
    });
    const handler = makeHandler(repo);
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", { ...base, type: "EXPENSE", amount: "100000", bankAccountId: "aC", cardId: "cC" }),
      ),
    ).rejects.toBeInstanceOf(CardLimitExceededError);
  });

  it("does not create/link a statement for a non-pool movement", async () => {
    const saveNew = vi.fn().mockImplementation(async (userId, plan) =>
      Transaction.fromPersistence({ id: "t1", userId, ...plan, createdAt: new Date(), updatedAt: new Date() }),
    );
    const findOrCreateOpenStatement = vi.fn();
    const repo = fakeRepo({
      findAccount: vi.fn().mockResolvedValue({ id: "a1", type: "CASH", creditLimit: "0", creditUsed: "0", billingCycleDay: null }),
      saveNew,
      findOrCreateOpenStatement,
    });
    const handler = makeHandler(repo);
    await handler.execute(new CreateTransactionCommand("u1", { ...base, type: "EXPENSE", amount: "1000", bankAccountId: "a1" }));
    expect(findOrCreateOpenStatement).not.toHaveBeenCalled();
    expect(saveNew).toHaveBeenCalledWith("u1", expect.objectContaining({ creditStatementId: null }), null);
  });
});
