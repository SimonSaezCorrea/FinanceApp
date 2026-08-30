import { describe, expect, it, vi } from "vitest";

import { RemoveTransactionHandler } from "../../../../../../src/domains/transaction/application/commands/remove-transaction.handler";
import { RemoveTransactionCommand } from "../../../../../../src/domains/transaction/application/commands/remove-transaction.command";
import {
  TransactionLinkedToInstallmentError,
  TransactionNotFoundError,
} from "../../../../../../src/domains/transaction/domain/errors";
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
  fakeInstallmentPaymentLookup,
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
    financeCharge: false,
    installmentPlanId: null,
    transferGroupId: null,
    creditStatementId: "stmt1",
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
  });
}

const creditAccount = () =>
  accountAggregate({ id: "aC", type: "CREDIT_CARD", creditLimit: "3000000", creditUsed: "100000" });

const creditCard: CardProps = {
  id: "cC",
  name: "Card",
  kind: "CREDIT",
  last4: "1234",
  expiryMonth: 12,
  expiryYear: 2030,
  isActive: true,
  isPrimary: true,
  isVirtual: false,
  isAdditional: false,
  cardholderName: null,
  network: null,
  limits: [],
};

/** Each foreign table is read through its own port now (see fake-ports). */
function makeHandler(
  repo: TransactionRepositoryPort,
  opts: {
    account?: BankAccount | null;
    card?: CardProps | null;
    statementPaid?: boolean;
    linkedToInstallment?: boolean;
  } = {},
) {
  return new RemoveTransactionHandler(
    { publish: vi.fn() } as never,
    repo,
    fakeBankAccountRepo({ findById: vi.fn(async () => opts.account ?? null) }),
    fakeCardAccountRepo({ findOnAccount: vi.fn(async () => opts.card ?? null) }),
    fakeCardLimitRepo(),
    fakeCreditStatementRepo({ isPaid: vi.fn(async () => opts.statementPaid ?? false) }),
    fakeInstallmentPaymentLookup({
      isLinkedToPayment: vi.fn(async () => opts.linkedToInstallment ?? false),
    }),
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
      // Nothing to give back: the purchase was charged to the credit line, so it
      // never took cash out of the account in the first place.
      [],
    );
  });

  it("never touches creditUsed when the linked statement is already PAID", async () => {
    const removeWithCreditAdjustment = vi.fn().mockResolvedValue(true);
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(txFixture()), removeWithCreditAdjustment }),
      { statementPaid: true },
    );
    await handler.execute(new RemoveTransactionCommand("u1", "tX"));
    // The pool stays put (already settled) and so does the balance: a movement
    // linked to a statement was charged to credit, never to cash.
    expect(removeWithCreditAdjustment).toHaveBeenCalledWith("u1", "tX", null, []);
  });
  // FR-028a: deleting it here would leave the instalment marked paid with nothing
  // behind it. Undoing the instalment deletes this row as part of the same reversal.
  it("refuses to delete a movement that backs an instalment", async () => {
    const removeWithCreditAdjustment = vi.fn();
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(txFixture()), removeWithCreditAdjustment }),
      { account: creditAccount(), card: creditCard, linkedToInstallment: true },
    );
    await expect(handler.execute(new RemoveTransactionCommand("u1", "tX"))).rejects.toBeInstanceOf(
      TransactionLinkedToInstallmentError,
    );
    expect(removeWithCreditAdjustment).not.toHaveBeenCalled();
  });

  // Spec 014, FR-024: a plan's PURCHASE movement carries `installmentPlanId` but is
  // never linked via `installmentPayment.transactionId` (that link is for a payment,
  // not a purchase) — so the old lookup alone would miss it. The refusal must fire
  // from the transaction's OWN field, not only from the lookup.
  it("refuses to delete a plan's purchase movement, even when the lookup says unlinked", () => {
    const purchase = Transaction.fromPersistence({
      ...txFixture().snapshot(),
      installmentPlanId: "plan1",
    });
    const removeWithCreditAdjustment = vi.fn();
    const handler = makeHandler(
      fakeRepo({ findOne: vi.fn().mockResolvedValue(purchase), removeWithCreditAdjustment }),
      { account: creditAccount(), card: creditCard, linkedToInstallment: false },
    );
    return expect(handler.execute(new RemoveTransactionCommand("u1", "tX"))).rejects.toBeInstanceOf(
      TransactionLinkedToInstallmentError,
    );
  });
});
