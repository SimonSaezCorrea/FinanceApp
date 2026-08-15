import { describe, expect, it, vi } from "vitest";

import { CreateTransactionCommand } from "../../../../../../src/domains/transaction/application/commands/create-transaction.command";
import { CreateTransactionHandler } from "../../../../../../src/domains/transaction/application/commands/create-transaction.handler";
import {
  AccountNotFoundError,
  CardAccountMismatchError,
  CardLimitExceededError,
  CardRequiredError,
} from "../../../../../../src/domains/transaction/domain/errors";
import type { TransactionRepositoryPort } from "../../../../../../src/domains/transaction/domain/ports/transaction.repository.port";
import { Transaction } from "../../../../../../src/domains/transaction/domain/transaction.aggregate";
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
    findTransferGroup: vi.fn(async () => null),
    saveTransferPair: vi.fn(),
    updateTransferPair: vi.fn(),
    removeTransferPair: vi.fn(async () => true),
    ...overrides,
  };
}

const base = { currency: "CLP", occurredAt: "2026-03-01T00:00:00.000Z" } as const;

const creditAccount = () =>
  accountAggregate({ id: "aC", type: "CREDIT_LINE", creditLimit: "3000000", creditUsed: "0" });

const creditCard: CardProps = {
  id: "cC",
  name: "Card",
  kind: "CREDIT",
  last4: "1234",
  expiryMonth: 12,
  expiryYear: 2030,
  isActive: true,
  isPrimary: true,
  limits: [],
};

/** The handler now reads the account/card/limit/statement each from its own
 * table's port, so a spec wires the ones its scenario exercises. */
function makeHandler(
  repo: TransactionRepositoryPort,
  opts: {
    account?: BankAccount | null;
    card?: CardProps | null;
    statements?: ReturnType<typeof fakeCreditStatementRepo>;
  } = {},
) {
  const accounts = fakeBankAccountRepo({ findById: vi.fn(async () => opts.account ?? null) });
  const cards = fakeCardAccountRepo({ findOnAccount: vi.fn(async () => opts.card ?? null) });
  const statements =
    opts.statements ??
    fakeCreditStatementRepo({ findOrCreateOpenForAccount: vi.fn(async () => ({ id: "stmt1" })) });
  return new CreateTransactionHandler(
    { publish: vi.fn() } as never,
    repo,
    accounts,
    cards,
    fakeCardLimitRepo(),
    statements,
  );
}

describe("CreateTransactionHandler", () => {
  it("throws AccountNotFoundError when the bank account is not the user's", async () => {
    const handler = makeHandler(fakeRepo(), { account: null });
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", {
          ...base,
          type: "EXPENSE",
          amount: "1000",
          bankAccountId: "ghost",
          cardId: "cP",
        }),
      ),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it("requires a card for a credit-line expense", async () => {
    const handler = makeHandler(fakeRepo(), { account: creditAccount() });
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", {
          ...base,
          type: "EXPENSE",
          amount: "1000",
          bankAccountId: "aC",
        }),
      ),
    ).rejects.toBeInstanceOf(CardRequiredError);
  });

  it("rejects a card that does not belong to the account", async () => {
    const handler = makeHandler(fakeRepo(), { account: creditAccount(), card: null });
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", {
          ...base,
          type: "EXPENSE",
          amount: "1000",
          bankAccountId: "aC",
          cardId: "cP",
        }),
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
    const handler = makeHandler(fakeRepo({ saveNew }), {
      account: creditAccount(),
      card: creditCard,
    });
    const result = await handler.execute(
      new CreateTransactionCommand("u1", {
        ...base,
        type: "EXPENSE",
        amount: "100000",
        bankAccountId: "aC",
        cardId: "cC",
      }),
    );
    expect(result.id).toBe("t1");
    expect(saveNew).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ creditStatementId: "stmt1" }),
      {
        accountId: "aC",
        delta: "100000",
      },
      // The cash balance always follows the movement, pool or no pool.
      [{ accountId: "aC", delta: "-100000.0000" }],
    );
  });

  it("rejects a credit-line expense that exceeds the persisted pool", async () => {
    const account = accountAggregate({
      id: "aC",
      type: "CREDIT_LINE",
      creditLimit: "3000000",
      creditUsed: "2950000",
    });
    const handler = makeHandler(fakeRepo(), { account, card: creditCard });
    await expect(
      handler.execute(
        new CreateTransactionCommand("u1", {
          ...base,
          type: "EXPENSE",
          amount: "100000",
          bankAccountId: "aC",
          cardId: "cC",
        }),
      ),
    ).rejects.toBeInstanceOf(CardLimitExceededError);
  });

  it("does not create/link a statement for a non-pool movement", async () => {
    const saveNew = vi.fn().mockImplementation(async (userId, plan) =>
      Transaction.fromPersistence({
        id: "t1",
        userId,
        ...plan,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const statements = fakeCreditStatementRepo();
    const handler = makeHandler(fakeRepo({ saveNew }), {
      account: accountAggregate({ id: "a1", type: "CASH" }),
      statements,
    });
    await handler.execute(
      new CreateTransactionCommand("u1", {
        ...base,
        type: "EXPENSE",
        amount: "1000",
        bankAccountId: "a1",
      }),
    );
    expect(statements.findOrCreateOpenForAccount).not.toHaveBeenCalled();
    expect(saveNew).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ creditStatementId: null }),
      null,
      [{ accountId: "a1", delta: "-1000.0000" }],
    );
  });
});
