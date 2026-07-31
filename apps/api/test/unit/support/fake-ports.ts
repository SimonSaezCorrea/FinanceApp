import { vi } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
} from "../../../src/domains/bank-account/domain/bank-account.aggregate";
import type { BankAccountRepositoryPort } from "../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { CardAccountRepositoryPort } from "../../../src/domains/card-account/domain/ports/card-account.repository.port";
import type { CardLimitRepositoryPort } from "../../../src/domains/card-limit/domain/ports/card-limit.repository.port";
import type { CreditStatementRepositoryPort } from "../../../src/domains/credit-statement/domain/ports/credit-statement.repository.port";
import type { TransactionSumsRepositoryPort } from "../../../src/domains/transaction/domain/ports/transaction-sums.repository.port";
import type { TransactionWriterRepositoryPort } from "../../../src/domains/transaction/domain/ports/transaction-writer.repository.port";

/**
 * Fake ports shared by the unit tier. Every table now owns its own port, so a
 * handler under test typically needs two or three of them — defining the full
 * shapes once here keeps each spec to the overrides it actually cares about (and
 * means adding a port method only touches this file, not 20 specs).
 */
export function fakeBankAccountRepo(
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

export function fakeTransactionSumsRepo(
  overrides: Partial<TransactionSumsRepositoryPort> = {},
): TransactionSumsRepositoryPort {
  return {
    sumByTypeForAccount: vi.fn(async () => ({ income: "0", expense: "0" })),
    windowForAccounts: vi.fn(async () => []),
    sumsByCard: vi.fn(async () => []),
    netForStatement: vi.fn(async () => "0"),
    ...overrides,
  };
}

export function fakeTransactionWriterRepo(
  overrides: Partial<TransactionWriterRepositoryPort> = {},
): TransactionWriterRepositoryPort {
  return {
    createWithTx: vi.fn(),
    createMany: vi.fn(async () => 0),
    ...overrides,
  };
}

export function fakeCreditStatementRepo(
  overrides: Partial<CreditStatementRepositoryPort> = {},
): CreditStatementRepositoryPort {
  return {
    findById: vi.fn(),
    findOpenForAccount: vi.fn(),
    listForAccount: vi.fn(),
    findOrCreateOpenForAccount: vi.fn(async () => ({ id: "st_open" })),
    isPaid: vi.fn(async () => false),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    sumLinkedTransactions: vi.fn(async () => "0"),
    ...overrides,
  };
}

export function fakeCardAccountRepo(
  overrides: Partial<CardAccountRepositoryPort> = {},
): CardAccountRepositoryPort {
  return {
    listByAccounts: vi.fn(async () => []),
    findOnAccount: vi.fn(async () => null),
    existsForUser: vi.fn(async () => true),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

export function fakeCardLimitRepo(
  overrides: Partial<CardLimitRepositoryPort> = {},
): CardLimitRepositoryPort {
  return {
    listByCards: vi.fn(async () => []),
    findForCardCurrency: vi.fn(async () => null),
    createForCard: vi.fn(),
    replaceForCard: vi.fn(),
    ...overrides,
  };
}

/**
 * Builds a real `BankAccount` aggregate from the small shape a movement test
 * cares about (type + credit pool + billing day). Specs used to hand the
 * `transaction` repository a plain `AccountContext`; now the account comes from
 * `bank-account`'s own port, which returns the aggregate.
 */
export function accountAggregate(input: {
  id: string;
  type: BankAccountProps["type"];
  creditLimit?: string;
  creditUsed?: string;
  billingCycleDay?: number | null;
  currency?: string;
  cards?: BankAccountProps["cards"];
  createdAt?: Date;
}): BankAccount {
  return BankAccount.fromPersistence({
    id: input.id,
    userId: "u1",
    name: "Account",
    type: input.type,
    status: "ACTIVE",
    currency: input.currency ?? "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: null,
    initialBalance: "0",
    currentBalance: "0",
    creditLimit: input.creditLimit ?? "0",
    creditUsedInitial: "0",
    creditUsed: input.creditUsed ?? "0",
    billingCycleDay: input.billingCycleDay ?? null,
    paymentMethod: "MANUAL",
    cards: input.cards ?? [],
    createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}
