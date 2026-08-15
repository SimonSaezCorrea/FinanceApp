import { describe, expect, it, vi } from "vitest";

import {
  GenerateAllDueStatementsHandler,
  GenerateStatementsHandler,
} from "../../../../../../src/domains/credit-statement/application/commands/generate-statements.handler";
import {
  GenerateAllDueStatementsCommand,
  GenerateStatementsCommand,
} from "../../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
import {
  BankAccount,
  type BankAccountProps,
  type CardProps,
} from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import type { BankAccountRepositoryPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { CreditStatementRepositoryPort } from "../../../../../../src/domains/credit-statement/domain/ports/credit-statement.repository.port";

function card(overrides: Partial<CardProps> = {}): CardProps {
  return {
    id: "card_1",
    name: "Primary",
    kind: "CREDIT",
    last4: "1111",
    expiryMonth: 1,
    expiryYear: 2030,
    isActive: true,
    isPrimary: true,
    isVirtual: false,
    isAdditional: false,
    cardholderName: null,
    network: null,
    limits: [],
    ...overrides,
  };
}

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
    billingCycleDay: 5,
    paymentMethod: "MANUAL",
    minimumPaymentPercent: null,
    cards: [card()],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function statementProps(overrides: Partial<CreditStatementProps> = {}): CreditStatementProps {
  return {
    id: "st_1",
    accountId: "acc_1",
    periodStart: new Date("2020-01-05"), // long past -> boundary already passed
    closedAt: null,
    paidAt: null,
    amount: "0",
    paidAmount: "0",
    carriedOverAmount: "0",
    carriedToId: null,
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
    incrementBalanceWithTx: vi.fn(),
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
    findOrCreateCarryOverTargetWithTx: vi.fn(async () => ({ id: "st_next" })),
    addCarriedOverWithTx: vi.fn(),
    isPaid: vi.fn(async () => false),
    listForAccount: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    sumLinkedTransactions: vi.fn(),
    breakdown: vi.fn(async () => ({ purchases: "0", installments: "0", installmentCount: 0 })),
    ...overrides,
  };
}

describe("GenerateStatementsHandler (manual trigger)", () => {
  it("closes a due OPEN statement for an eligible account", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({
      findOpenForAccount: vi.fn(async () => statement),
      save: vi.fn(async () => undefined),
    });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(closed).toBe(true);
    expect(statement.state.name).toBe("PENDING");
    expect(statementRepo.save).toHaveBeenCalledWith(statement);
  });

  it("does nothing when no statement is OPEN (no usage since last close)", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({ findOpenForAccount: vi.fn(async () => null) });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));
    expect(closed).toBe(false);
  });

  it("does nothing for an INACTIVE account (leaves it accumulating)", async () => {
    const account = BankAccount.fromPersistence(accountProps({ status: "INACTIVE" }));
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({ findOpenForAccount: vi.fn(async () => statement) });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));
    expect(closed).toBe(false);
    expect(statement.state.name).toBe("OPEN");
  });
});

describe("GenerateAllDueStatementsHandler (cron trigger, scope: system)", () => {
  it("closes every due account's OPEN statement, returning the count closed", async () => {
    const account1 = BankAccount.fromPersistence(accountProps({ id: "acc_1" }));
    const account2 = BankAccount.fromPersistence(accountProps({ id: "acc_2" }));
    const statement1 = CreditStatement.fromPersistence(
      statementProps({ id: "st_1", accountId: "acc_1" }),
    );
    const statement2 = CreditStatement.fromPersistence(
      statementProps({ id: "st_2", accountId: "acc_2" }),
    );

    const accountRepo = fakeAccountRepo({
      listDueForBilling: vi.fn(async () => [account1, account2]),
    });
    const statementRepo = fakeStatementRepo({
      findOpenForAccount: vi.fn(async (accountId: string) =>
        accountId === "acc_1" ? statement1 : statement2,
      ),
      save: vi.fn(async () => undefined),
    });
    const handler = new GenerateAllDueStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
    );

    const count = await handler.execute(new GenerateAllDueStatementsCommand());

    expect(count).toBe(2);
    expect(statement1.state.name).toBe("PENDING");
    expect(statement2.state.name).toBe("PENDING");
  });
});
