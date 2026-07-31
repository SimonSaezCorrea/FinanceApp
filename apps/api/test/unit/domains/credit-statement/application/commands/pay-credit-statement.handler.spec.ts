import { describe, expect, it, vi } from "vitest";
import { fakeTransactionWriterRepo } from "../../../../support/fake-ports";

import { PayCreditStatementHandler } from "../../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.handler";
import { PayCreditStatementCommand } from "../../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.command";
import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import {
  InvalidPaymentSourceError,
  NothingToPayError,
} from "../../../../../../src/domains/credit-statement/domain/errors";
import type { BankAccountRepositoryPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { CreditStatementRepositoryPort } from "../../../../../../src/domains/credit-statement/domain/ports/credit-statement.repository.port";

function accountProps(overrides: Partial<BankAccountProps> = {}): BankAccountProps {
  return {
    id: "acc_1",
    userId: "u1",
    name: "Credit line",
    type: "CREDIT_LINE",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: null,
    initialBalance: "0",
    currentBalance: "0",
    creditLimit: "100000",
    creditUsedInitial: "0",
    creditUsed: "50000",
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    cards: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function statementProps(overrides: Partial<CreditStatementProps> = {}): CreditStatementProps {
  return {
    id: "st_1",
    accountId: "acc_1",
    periodStart: new Date("2026-01-01"),
    closedAt: new Date("2026-02-01"),
    paidAt: null,
    amount: "0",
    paidFromAccountId: null,
    paidTransactionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeAccountRepo(
  overrides: Partial<BankAccountRepositoryPort> = {},
): BankAccountRepositoryPort {
  return {
    findById: vi.fn(),
    listByUser: vi.fn(),
    listDueForBilling: vi.fn(),
    institutionName: vi.fn(),
    createWithCards: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    remove: vi.fn(),
    addCard: vi.fn(),
    updateCard: vi.fn(),
    removeCard: vi.fn(),
    incrementCreditUsedWithTx: vi.fn(),
    ...overrides,
  };
}

function fakeStatementRepo(
  overrides: Partial<CreditStatementRepositoryPort> = {},
): CreditStatementRepositoryPort {
  return {
    findById: vi.fn(),
    findOpenForAccount: vi.fn(),
    findOrCreateOpenForAccount: vi.fn(async () => ({ id: "st_open" })),
    isPaid: vi.fn(async () => false),
    listForAccount: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    sumLinkedTransactions: vi.fn(),
    ...overrides,
  };
}

function fakePrisma() {
  const created: unknown[] = [];
  return {
    transaction: { create: vi.fn(async (args: { data: unknown }) => created.push(args.data)) },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ transaction: { create: vi.fn() } }),
    ),
  };
}

describe("PayCreditStatementHandler", () => {
  it("pays a statement: decrements creditUsed, freezes the statement, creates the payment transaction atomically", async () => {
    const creditAccount = BankAccount.fromPersistence(accountProps());
    const fromAccount = BankAccount.fromPersistence(
      accountProps({ id: "acc_2", type: "CHECKING", creditLimit: "0" }),
    );
    const statement = CreditStatement.fromPersistence(statementProps());

    const accountRepo = fakeAccountRepo({
      findById: vi.fn(async (_userId: string, id: string) =>
        id === "acc_1" ? creditAccount : fromAccount,
      ),
    });
    const statementRepo = fakeStatementRepo({
      findById: vi.fn(async () => statement),
      sumLinkedTransactions: vi.fn(async () => "10000"),
    });
    const prisma = fakePrisma();

    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      prisma as never,
    );

    const result = await handler.execute(
      new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2"),
    );

    expect(result.paidFromAccountId).toBe("acc_2");
    expect(statement.state.name).toBe("PAID");
    expect(creditAccount.creditUsed).toBe("40000.0000");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects paying from a CREDIT_LINE source account", async () => {
    const creditAccount = BankAccount.fromPersistence(accountProps());
    const otherCreditLine = BankAccount.fromPersistence(accountProps({ id: "acc_3" }));
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({
      findById: vi.fn(async (_userId: string, id: string) =>
        id === "acc_1" ? creditAccount : otherCreditLine,
      ),
    });
    const statementRepo = fakeStatementRepo({ findById: vi.fn(async () => statement) });
    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePrisma() as never,
    );
    await expect(
      handler.execute(new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_3")),
    ).rejects.toThrow(InvalidPaymentSourceError);
  });

  it("rejects paying when there's nothing to pay", async () => {
    const creditAccount = BankAccount.fromPersistence(accountProps());
    const fromAccount = BankAccount.fromPersistence(
      accountProps({ id: "acc_2", type: "CHECKING" }),
    );
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({
      findById: vi.fn(async (_userId: string, id: string) =>
        id === "acc_1" ? creditAccount : fromAccount,
      ),
    });
    const statementRepo = fakeStatementRepo({
      findById: vi.fn(async () => statement),
      sumLinkedTransactions: vi.fn(async () => "0"),
    });
    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePrisma() as never,
    );
    await expect(
      handler.execute(new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2")),
    ).rejects.toThrow(NothingToPayError);
  });
});
