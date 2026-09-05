import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { GetTransactionQueryHandler } from "../../../../../../src/domains/transaction/application/queries/get-transaction.handler";
import { GetTransactionQuery } from "../../../../../../src/domains/transaction/application/queries/get-transaction.query";
import { ListTransactionsQueryHandler } from "../../../../../../src/domains/transaction/application/queries/list-transactions.handler";
import { ListTransactionsQuery } from "../../../../../../src/domains/transaction/application/queries/list-transactions.query";
import { SummarizeTransactionsQueryHandler } from "../../../../../../src/domains/transaction/application/queries/summarize-transactions.handler";
import { SummarizeTransactionsQuery } from "../../../../../../src/domains/transaction/application/queries/summarize-transactions.query";
import {
  InvalidCursorError,
  TransactionNotFoundError,
} from "../../../../../../src/domains/transaction/domain/errors";
import { Transaction } from "../../../../../../src/domains/transaction/domain/transaction.aggregate";
import type { TransactionRepositoryPort } from "../../../../../../src/domains/transaction/domain/ports/transaction.repository.port";

const emptyPage = { items: [], nextCursor: null };

const fakeConfig = () => ({ getOrThrow: () => "test-cursor-secret" }) as unknown as ConfigService;

function fakeRepo(overrides: Partial<TransactionRepositoryPort> = {}): TransactionRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue(emptyPage),
    summary: vi.fn().mockResolvedValue({ total: 0, currencyTotals: [], categories: [] }),
    findOne: vi.fn(),
    sumsForCard: vi.fn(async () => ({ income: "0", expense: "0" })),
    saveNew: vi.fn(),
    saveNewWithTx: vi.fn(),
    saveUpdate: vi.fn(),
    removeWithCreditAdjustment: vi.fn(),
    findTransferGroup: vi.fn(async () => null),
    saveTransferPair: vi.fn(),
    saveTransferPairWithTx: vi.fn(),
    updateTransferPair: vi.fn(),
    removeTransferPair: vi.fn(async () => true),
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
  financeCharge: false,
  installmentPlanId: null,
  transferGroupId: null,
  creditStatementId: null,
  debtId: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
});

describe("ListTransactionsQueryHandler", () => {
  it("maps rows to the contract (amount fixed string)", async () => {
    const handler = new ListTransactionsQueryHandler(
      fakeRepo({ list: vi.fn().mockResolvedValue({ items: [row], nextCursor: null }) }),
      fakeConfig(),
    );
    const page = await handler.execute(new ListTransactionsQuery("u1", {}));
    expect(page.items[0]!.amount).toBe("33.3000");
    expect(page.items[0]!.type).toBe("EXPENSE");
  });

  it("threads bankAccountId + cardId into the list where-clause", async () => {
    const list = vi.fn().mockResolvedValue(emptyPage);
    const handler = new ListTransactionsQueryHandler(fakeRepo({ list }), fakeConfig());
    await handler.execute(new ListTransactionsQuery("u1", { bankAccountId: "aC", cardId: "cS" }));
    const where = list.mock.calls[0]![1] as { bankAccountId?: string; cardId?: string };
    expect(where.bankAccountId).toBe("aC");
    expect(where.cardId).toBe("cS");
  });

  it("passes limit through and round-trips the last row into an opaque nextCursor", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [row],
      nextCursor: { occurredAt: new Date("2026-03-01T00:00:00Z"), id: "t1" },
    });
    const handler = new ListTransactionsQueryHandler(fakeRepo({ list }), fakeConfig());

    const page = await handler.execute(new ListTransactionsQuery("u1", { limit: 20 }));

    expect(list.mock.calls[0]![2]).toMatchObject({ limit: 20, cursor: undefined });
    expect(page.nextCursor).toBeTypeOf("string");

    // Feeding that cursor back decodes to the same keyset position.
    await handler.execute(new ListTransactionsQuery("u1", { limit: 20, cursor: page.nextCursor! }));
    expect(list.mock.calls[1]![2]).toMatchObject({
      limit: 20,
      cursor: { occurredAt: new Date("2026-03-01T00:00:00Z"), id: "t1" },
    });
  });

  it("rejects a cursor this API never issued instead of silently restarting", async () => {
    const handler = new ListTransactionsQueryHandler(fakeRepo(), fakeConfig());
    await expect(
      handler.execute(new ListTransactionsQuery("u1", { limit: 20, cursor: "not-a-cursor" })),
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });

  it("omits pagination entirely when no limit is given (aggregate consumers)", async () => {
    const list = vi.fn().mockResolvedValue(emptyPage);
    const handler = new ListTransactionsQueryHandler(fakeRepo({ list }), fakeConfig());
    await handler.execute(new ListTransactionsQuery("u1", {}));
    expect(list.mock.calls[0]![2]).toMatchObject({ limit: undefined, cursor: undefined });
  });
});

describe("SummarizeTransactionsQueryHandler", () => {
  it("summarizes the filtered set, ignoring page selection", async () => {
    const summary = vi
      .fn()
      .mockResolvedValue({ total: 42, currencyTotals: [], categories: ["food"] });
    const handler = new SummarizeTransactionsQueryHandler(fakeRepo({ summary }));

    const result = await handler.execute(
      new SummarizeTransactionsQuery("u1", { limit: 20, cursor: "whatever", category: "fo" }),
    );

    expect(result.total).toBe(42);
    const where = summary.mock.calls[0]![1] as Record<string, unknown>;
    expect(where.category).toBe("fo");
    expect(where).not.toHaveProperty("limit");
    expect(where).not.toHaveProperty("cursor");
  });
});

describe("GetTransactionQueryHandler", () => {
  it("throws TransactionNotFoundError when the row is missing", async () => {
    const handler = new GetTransactionQueryHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(null) }),
    );
    await expect(handler.execute(new GetTransactionQuery("u1", "nope"))).rejects.toBeInstanceOf(
      TransactionNotFoundError,
    );
  });

  it("returns the mapped contract for an existing row", async () => {
    const handler = new GetTransactionQueryHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(row) }),
    );
    const tx = await handler.execute(new GetTransactionQuery("u1", "t1"));
    expect(tx.id).toBe("t1");
  });
});
