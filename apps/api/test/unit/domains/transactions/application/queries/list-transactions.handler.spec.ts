import { describe, expect, it, vi } from "vitest";

import { GetTransactionQueryHandler } from "../../../../../../src/domains/transactions/application/queries/get-transaction.handler";
import { GetTransactionQuery } from "../../../../../../src/domains/transactions/application/queries/get-transaction.query";
import { ListTransactionsQueryHandler } from "../../../../../../src/domains/transactions/application/queries/list-transactions.handler";
import { ListTransactionsQuery } from "../../../../../../src/domains/transactions/application/queries/list-transactions.query";
import { TransactionNotFoundError } from "../../../../../../src/domains/transactions/domain/errors";
import { Transaction } from "../../../../../../src/domains/transactions/domain/transaction.aggregate";
import type { TransactionRepositoryPort } from "../../../../../../src/domains/transactions/domain/ports/transaction.repository.port";

function fakeRepo(overrides: Partial<TransactionRepositoryPort> = {}): TransactionRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    findAccount: vi.fn(),
    findCardInAccount: vi.fn(),
    findCardLimit: vi.fn(),
    sumsForCard: vi.fn(),
    findOrCreateOpenStatement: vi.fn(),
    isStatementPaid: vi.fn(),
    saveNew: vi.fn(),
    saveUpdate: vi.fn(),
    removeWithCreditAdjustment: vi.fn(),
    ...overrides,
  };
}

const row = Transaction.fromPersistence({
  id: "t1",
  userId: "u1",
  type: "EXPENSE",
  amount: "33.3",
  currency: "CLP",
  occurredAt: new Date("2026-03-01T00:00:00Z"),
  category: "food",
  description: null,
  observation: null,
  emisor: null,
  receptor: null,
  lugar: null,
  bankAccountId: "a1",
  cardId: null,
  installmentPlanId: null,
  creditStatementId: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
});

describe("ListTransactionsQueryHandler", () => {
  it("maps rows to the contract (amount fixed string)", async () => {
    const handler = new ListTransactionsQueryHandler(fakeRepo({ list: vi.fn().mockResolvedValue([row]) }));
    const [tx] = await handler.execute(new ListTransactionsQuery("u1", {}));
    expect(tx.amount).toBe("33.3000");
    expect(tx.type).toBe("EXPENSE");
  });

  it("threads bankAccountId + cardId into the list where-clause", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const handler = new ListTransactionsQueryHandler(fakeRepo({ list }));
    await handler.execute(new ListTransactionsQuery("u1", { bankAccountId: "aC", cardId: "cS" }));
    const where = list.mock.calls[0]![1] as { bankAccountId?: string; cardId?: string };
    expect(where.bankAccountId).toBe("aC");
    expect(where.cardId).toBe("cS");
  });
});

describe("GetTransactionQueryHandler", () => {
  it("throws TransactionNotFoundError when the row is missing", async () => {
    const handler = new GetTransactionQueryHandler(fakeRepo({ findOne: vi.fn().mockResolvedValue(null) }));
    await expect(handler.execute(new GetTransactionQuery("u1", "nope"))).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it("returns the mapped contract for an existing row", async () => {
    const handler = new GetTransactionQueryHandler(fakeRepo({ findOne: vi.fn().mockResolvedValue(row) }));
    const tx = await handler.execute(new GetTransactionQuery("u1", "t1"));
    expect(tx.id).toBe("t1");
  });
});
