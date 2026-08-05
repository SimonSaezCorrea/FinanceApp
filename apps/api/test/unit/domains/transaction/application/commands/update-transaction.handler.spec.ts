import { describe, expect, it, vi } from "vitest";

import { UpdateTransactionHandler } from "../../../../../../src/domains/transaction/application/commands/update-transaction.handler";
import { UpdateTransactionCommand } from "../../../../../../src/domains/transaction/application/commands/update-transaction.command";
import { TransactionNotFoundError } from "../../../../../../src/domains/transaction/domain/errors";
import { Transaction } from "../../../../../../src/domains/transaction/domain/transaction.aggregate";
import type { TransactionRepositoryPort } from "../../../../../../src/domains/transaction/domain/ports/transaction.repository.port";
import type { BankAccount } from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import type { CardProps } from "../../../../../../src/domains/card-account/domain/card-account.entity";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeCardAccountRepo,
  fakeCardLimitRepo,
  fakeCreditStatementRepo,
} from "../../../../support/fake-ports";

function fakeRepo(overrides: Partial<TransactionRepositoryPort> = {}): TransactionRepositoryPort {
  return {
    list: vi.fn(),
    summary: vi.fn(),
    findOne: vi.fn(),
    sumsForCard: vi.fn(async () => ({ income: "0", expense: "0" })),
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

const creditAccount = () =>
  accountAggregate({ id: "aC", type: "CREDIT_LINE", creditLimit: "3000000", creditUsed: "100000" });

const card = (kind: CardProps["kind"]): CardProps => ({
  id: "cC",
  name: "Card",
  kind,
  last4: "1234",
  expiryMonth: 12,
  expiryYear: 2030,
  isActive: true,
  isPrimary: kind === "CREDIT",
  limits: [],
});

/** Each foreign table is read through its own port now (see fake-ports). */
function makeHandler(
  repo: TransactionRepositoryPort,
  opts: {
    accountById?: (id: string) => BankAccount | null;
    cardByAccount?: (accountId: string) => CardProps | null;
    statementPaid?: boolean;
  } = {},
) {
  return new UpdateTransactionHandler(
    { publish: vi.fn() } as never,
    repo,
    fakeBankAccountRepo({
      findById: vi.fn(async (_u: string, id: string) => opts.accountById?.(id) ?? null),
    }),
    fakeCardAccountRepo({
      findOnAccount: vi.fn(
        async (_u: string, accountId: string) => opts.cardByAccount?.(accountId) ?? null,
      ),
    }),
    fakeCardLimitRepo(),
    fakeCreditStatementRepo({ isPaid: vi.fn(async () => opts.statementPaid ?? false) }),
  );
}

describe("UpdateTransactionHandler", () => {
  it("throws TransactionNotFoundError when the row is missing", async () => {
    const handler = makeHandler(fakeRepo({ findOne: vi.fn().mockResolvedValue(null) }));
    await expect(
      handler.execute(new UpdateTransactionCommand("u1", "nope", { amount: "10" })),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it("nets the old vs. new contribution to the same account on edit", async () => {
    const current = txFixture();
    const saveUpdate = vi.fn().mockImplementation(async (userId, id, patch) =>
      Transaction.fromPersistence({
        ...current.snapshot(),
        amount: patch.amount ?? current.amount,
      }),
    );
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(current), saveUpdate }),
      {
        accountById: () => creditAccount(),
        cardByAccount: () => card("CREDIT"),
      },
    );
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
    const otherAccount = accountAggregate({ id: "aD", type: "CHECKING" });
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(current), saveUpdate }),
      {
        accountById: (id) => (id === "aC" ? creditAccount() : otherAccount),
        cardByAccount: (accountId) => (accountId === "aC" ? card("CREDIT") : card("DEBIT")),
      },
    );
    await handler.execute(
      new UpdateTransactionCommand("u1", "tX", { bankAccountId: "aD", cardId: undefined }),
    );
    const deltas = saveUpdate.mock.calls[0]![3] as { accountId: string; delta: string }[];
    expect(deltas).toEqual(expect.arrayContaining([{ accountId: "aC", delta: "-100000.0000" }]));
  });

  it("never touches creditUsed when the linked statement is already PAID", async () => {
    const current = txFixture();
    const saveUpdate = vi.fn().mockResolvedValue(txFixture({ amount: "250000" }));
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(current), saveUpdate }),
      {
        accountById: () => creditAccount(),
        cardByAccount: () => card("CREDIT"),
        statementPaid: true,
      },
    );
    await handler.execute(new UpdateTransactionCommand("u1", "tX", { amount: "250000" }));
    expect(saveUpdate).toHaveBeenCalledWith("u1", "tX", expect.anything(), []);
  });
});
