import { describe, expect, it, vi } from "vitest";

import { RemoveTransactionHandler } from "../../../../../../src/domains/transactions/application/commands/remove-transaction.handler";
import { RemoveTransactionCommand } from "../../../../../../src/domains/transactions/application/commands/remove-transaction.command";
import { TransactionNotFoundError } from "../../../../../../src/domains/transactions/domain/errors";
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
    findOrCreateOpenStatement: vi.fn(),
    isStatementPaid: vi.fn().mockResolvedValue(false),
    saveNew: vi.fn(),
    saveUpdate: vi.fn(),
    removeWithCreditAdjustment: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function txFixture() {
  return Transaction.fromPersistence({
    id: "tX",
    userId: "u1",
    type: "EXPENSE",
    amount: "100000",
    currency: "CLP",
    occurredAt: new Date("2026-03-01"),
    category: null,
    description: null,
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    bankAccountId: "aC",
    cardId: "cC",
    installmentPlanId: null,
    creditStatementId: "stmt1",
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
  });
}

const creditAccount = { id: "aC", type: "CREDIT_LINE" as const, creditLimit: "3000000", creditUsed: "100000", billingCycleDay: null };

describe("RemoveTransactionHandler", () => {
  it("throws TransactionNotFoundError when the row is missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new RemoveTransactionHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RemoveTransactionCommand("u1", "nope"))).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it("reverts the transaction's contribution on delete", async () => {
    const removeWithCreditAdjustment = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(txFixture()),
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      removeWithCreditAdjustment,
    });
    const handler = new RemoveTransactionHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveTransactionCommand("u1", "tX"));
    expect(removeWithCreditAdjustment).toHaveBeenCalledWith("u1", "tX", { accountId: "aC", delta: "-100000.0000" });
  });

  it("never touches creditUsed when the linked statement is already PAID", async () => {
    const removeWithCreditAdjustment = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(txFixture()),
      isStatementPaid: vi.fn().mockResolvedValue(true),
      removeWithCreditAdjustment,
    });
    const handler = new RemoveTransactionHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveTransactionCommand("u1", "tX"));
    expect(removeWithCreditAdjustment).toHaveBeenCalledWith("u1", "tX", null);
  });
});
