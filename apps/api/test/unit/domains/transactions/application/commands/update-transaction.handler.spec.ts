import { describe, expect, it, vi } from "vitest";

import { UpdateTransactionHandler } from "../../../../../../src/domains/transactions/application/commands/update-transaction.handler";
import { UpdateTransactionCommand } from "../../../../../../src/domains/transactions/application/commands/update-transaction.command";
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
    findOrCreateOpenStatement: vi.fn().mockResolvedValue({ id: "stmt1" }),
    isStatementPaid: vi.fn().mockResolvedValue(false),
    saveNew: vi.fn(),
    saveUpdate: vi.fn(),
    removeWithCreditAdjustment: vi.fn(),
    ...overrides,
  };
}

function txFixture(overrides: Partial<Parameters<typeof Transaction.fromPersistence>[0]> = {}) {
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
    ...overrides,
  });
}

const creditAccount = { id: "aC", type: "CREDIT_LINE" as const, creditLimit: "3000000", creditUsed: "100000", billingCycleDay: null };

function makeHandler(repo: TransactionRepositoryPort) {
  return new UpdateTransactionHandler({ publish: vi.fn() } as never, repo);
}

describe("UpdateTransactionHandler", () => {
  it("throws TransactionNotFoundError when the row is missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = makeHandler(repo);
    await expect(handler.execute(new UpdateTransactionCommand("u1", "nope", { amount: "10" }))).rejects.toBeInstanceOf(
      TransactionNotFoundError,
    );
  });

  it("nets the old vs. new contribution to the same account on edit", async () => {
    const current = txFixture();
    const saveUpdate = vi.fn().mockImplementation(async (userId, id, patch) =>
      Transaction.fromPersistence({ ...current.snapshot(), amount: patch.amount ?? current.amount }),
    );
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(current),
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      saveUpdate,
    });
    const handler = makeHandler(repo);
    await handler.execute(new UpdateTransactionCommand("u1", "tX", { amount: "250000" }));
    expect(saveUpdate).toHaveBeenCalledWith(
      "u1",
      "tX",
      expect.objectContaining({ amount: "250000" }),
      [{ accountId: "aC", delta: "150000.0000" }],
    );
  });

  it("reverts the old contribution and applies the new one on a cross-account move", async () => {
    const current = txFixture();
    const saveUpdate = vi.fn().mockResolvedValue(txFixture({ bankAccountId: "aD" }));
    const otherAccount = { id: "aD", type: "CHECKING" as const, creditLimit: "0", creditUsed: "0", billingCycleDay: null };
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(current),
      findAccount: vi.fn().mockImplementation(async (_u: string, id: string) => (id === "aC" ? creditAccount : otherAccount)),
      findCardInAccount: vi
        .fn()
        .mockImplementation(async (_u: string, _cardId: string, accountId: string) =>
          accountId === "aC" ? { id: "cC", kind: "CREDIT" } : { id: "cC", kind: "DEBIT" },
        ),
      saveUpdate,
    });
    const handler = makeHandler(repo);
    await handler.execute(new UpdateTransactionCommand("u1", "tX", { bankAccountId: "aD", cardId: undefined }));
    const deltas = saveUpdate.mock.calls[0]![3] as { accountId: string; delta: string }[];
    expect(deltas).toEqual(
      expect.arrayContaining([
        { accountId: "aC", delta: "-100000.0000" },
      ]),
    );
  });

  it("never touches creditUsed when the linked statement is already PAID", async () => {
    const current = txFixture();
    const saveUpdate = vi.fn().mockResolvedValue(txFixture({ amount: "250000" }));
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(current),
      findAccount: vi.fn().mockResolvedValue(creditAccount),
      findCardInAccount: vi.fn().mockResolvedValue({ id: "cC", kind: "CREDIT" }),
      isStatementPaid: vi.fn().mockResolvedValue(true),
      saveUpdate,
    });
    const handler = makeHandler(repo);
    await handler.execute(new UpdateTransactionCommand("u1", "tX", { amount: "250000" }));
    expect(saveUpdate).toHaveBeenCalledWith("u1", "tX", expect.anything(), []);
  });
});
