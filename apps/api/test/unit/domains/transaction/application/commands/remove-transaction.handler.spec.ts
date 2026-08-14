import { describe, expect, it, vi } from "vitest";

import { RemoveTransactionHandler } from "../../../../../../src/domains/transaction/application/commands/remove-transaction.handler";
import { RemoveTransactionCommand } from "../../../../../../src/domains/transaction/application/commands/remove-transaction.command";
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
    removeWithCreditAdjustment: vi.fn().mockResolvedValue(true),
    findTransferGroup: vi.fn(async () => null),
    saveTransferPair: vi.fn(),
    updateTransferPair: vi.fn(),
    removeTransferPair: vi.fn(async () => true),
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
    transferGroupId: null,
    creditStatementId: "stmt1",
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
  });
}

const creditAccount = () =>
  accountAggregate({ id: "aC", type: "CREDIT_LINE", creditLimit: "3000000", creditUsed: "100000" });

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

/** Each foreign table is read through its own port now (see fake-ports). */
function makeHandler(
  repo: TransactionRepositoryPort,
  opts: { account?: BankAccount | null; card?: CardProps | null; statementPaid?: boolean } = {},
) {
  return new RemoveTransactionHandler(
    { publish: vi.fn() } as never,
    repo,
    fakeBankAccountRepo({ findById: vi.fn(async () => opts.account ?? null) }),
    fakeCardAccountRepo({ findOnAccount: vi.fn(async () => opts.card ?? null) }),
    fakeCardLimitRepo(),
    fakeCreditStatementRepo({ isPaid: vi.fn(async () => opts.statementPaid ?? false) }),
  );
}

describe("RemoveTransactionHandler", () => {
  it("throws TransactionNotFoundError when the row is missing", async () => {
    const handler = makeHandler(fakeRepo({ findOne: vi.fn().mockResolvedValue(null) }));
    await expect(
      handler.execute(new RemoveTransactionCommand("u1", "nope")),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it("reverts the transaction's contribution on delete", async () => {
    const removeWithCreditAdjustment = vi.fn().mockResolvedValue(true);
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(txFixture()), removeWithCreditAdjustment }),
      { account: creditAccount(), card: creditCard },
    );
    await handler.execute(new RemoveTransactionCommand("u1", "tX"));
    expect(removeWithCreditAdjustment).toHaveBeenCalledWith(
      "u1",
      "tX",
      { accountId: "aC", delta: "-100000.0000" },
      // Deleting an expense gives its money back to the balance.
      [{ accountId: "aC", delta: "100000.0000" }],
    );
  });

  it("never touches creditUsed when the linked statement is already PAID", async () => {
    const removeWithCreditAdjustment = vi.fn().mockResolvedValue(true);
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(txFixture()), removeWithCreditAdjustment }),
      { statementPaid: true },
    );
    await handler.execute(new RemoveTransactionCommand("u1", "tX"));
    // The pool stays put (already settled), but the cash still left the account,
    // so the balance is still corrected.
    expect(removeWithCreditAdjustment).toHaveBeenCalledWith("u1", "tX", null, [
      { accountId: "aC", delta: "100000.0000" },
    ]);
  });
});
