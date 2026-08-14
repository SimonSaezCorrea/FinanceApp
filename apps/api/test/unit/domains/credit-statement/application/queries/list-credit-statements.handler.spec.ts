import { describe, expect, it, vi } from "vitest";

import { ListCreditStatementsQueryHandler } from "../../../../../../src/domains/credit-statement/application/queries/list-credit-statements.handler";
import { ListCreditStatementsQuery } from "../../../../../../src/domains/credit-statement/application/queries/list-credit-statements.query";
import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import { AccountNotFoundError } from "../../../../../../src/domains/bank-account/domain/errors";
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
    creditUsed: "0",
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    minimumPaymentPercent: null,
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

describe("ListCreditStatementsQueryHandler", () => {
  it("lists an account's statements, live-summing the still-OPEN one's amount", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({
      listForAccount: vi.fn(async () => [statement]),
      sumLinkedTransactions: vi.fn(async () => "12345"),
      breakdown: vi.fn(async () => ({ purchases: "0", installments: "0", installmentCount: 0 })),
    });
    const handler = new ListCreditStatementsQueryHandler(accountRepo, statementRepo);

    const result = await handler.execute(new ListCreditStatementsQuery("u1", "acc_1"));

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("OPEN");
    // Normalised to money scale by the shared DTO mapper, like every other
    // amount the API returns.
    expect(result[0].amount).toBe("12345.0000");
  });

  it("throws AccountNotFoundError for a missing account", async () => {
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => null) });
    const statementRepo = fakeStatementRepo();
    const handler = new ListCreditStatementsQueryHandler(accountRepo, statementRepo);

    await expect(handler.execute(new ListCreditStatementsQuery("u1", "missing"))).rejects.toThrow(
      AccountNotFoundError,
    );
  });
});
