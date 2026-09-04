import { vi } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
} from "../../../src/domains/bank-account/domain/bank-account.aggregate";
import type { BankAccountRepositoryPort } from "../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { CardAccountRepositoryPort } from "../../../src/domains/card-account/domain/ports/card-account.repository.port";
import type { CardLimitRepositoryPort } from "../../../src/domains/card-limit/domain/ports/card-limit.repository.port";
import type { CreditStatementRepositoryPort } from "../../../src/domains/credit-statement/domain/ports/credit-statement.repository.port";
import type { InstallmentPaymentLookupPort } from "../../../src/domains/installment-payment/domain/ports/installment-payment-lookup.port";
import { IdempotencyRecord } from "../../../src/domains/idempotency-record/domain/idempotency-record.aggregate";
import type { IdempotencyRecordRepositoryPort } from "../../../src/domains/idempotency-record/domain/ports/idempotency-record.repository.port";
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
    institutionCountry: vi.fn(async () => null),
    countByType: vi.fn(async () => 2),
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

export function fakeTransactionSumsRepo(
  overrides: Partial<TransactionSumsRepositoryPort> = {},
): TransactionSumsRepositoryPort {
  return {
    sumByTypeForAccount: vi.fn(async () => ({ income: "0", expense: "0" })),
    windowForAccounts: vi.fn(async () => []),
    sumsByCard: vi.fn(async () => []),
    netForStatement: vi.fn(async () => "0"),
    netForPeriod: vi.fn(async () => "0"),
    ...overrides,
  };
}

export function fakeTransactionWriterRepo(
  overrides: Partial<TransactionWriterRepositoryPort> = {},
): TransactionWriterRepositoryPort {
  return {
    createWithTx: vi.fn(),
    relinkToStatementWithTx: vi.fn(),
    updateAmountWithTx: vi.fn(),
    deleteWithTx: vi.fn(),
    listForInstallmentPlan: vi.fn(async () => []),
    deleteManyWithTx: vi.fn(),
    accountIdForTransaction: vi.fn(async () => null),
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
    findOrCreateCarryOverTargetWithTx: vi.fn(async () => ({ id: "st_next" })),
    addCarriedOverWithTx: vi.fn(),
    isPaid: vi.fn(async () => false),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    sumLinkedTransactions: vi.fn(async () => "0"),
    breakdown: vi.fn(async () => ({ purchases: "0", installments: "0", installmentCount: 0 })),
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
    accountIdForCard: vi.fn(async () => null),
    kindForCard: vi.fn(async () => null),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

/** The one question `transaction` asks `installment-payment` before letting a
 *  movement be edited or deleted (FR-028a). Defaults to "not linked", the ordinary
 *  case for every movement that has nothing to do with a plan. */
export function fakeInstallmentPaymentLookup(
  overrides: Partial<InstallmentPaymentLookupPort> = {},
): InstallmentPaymentLookupPort {
  return {
    isLinkedToPayment: vi.fn(async () => false),
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
  currentBalance?: string;
  billingCycleDay?: number | null;
  billingCycleType?: BankAccountProps["billingCycleType"];
  paymentDueDay?: number | null;
  paymentDueCycleType?: BankAccountProps["paymentDueCycleType"];
  minimumPaymentPercent?: string | null;
  overdraftLimit?: string;
  balanceCeiling?: string | null;
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
    accountAlias: null,
    initialBalance: input.currentBalance ?? "0",
    overdraftLimit: input.overdraftLimit ?? "0",
    balanceCeiling: input.balanceCeiling ?? null,
    currentBalance: input.currentBalance ?? "0",
    creditLimit: input.creditLimit ?? "0",
    creditUsedInitial: "0",
    creditUsed: input.creditUsed ?? "0",
    billingCycleDay: input.billingCycleDay ?? null,
    billingCycleType: input.billingCycleType ?? "BUSINESS_DAY",
    paymentMethod: "MANUAL",
    paymentDueDay: input.paymentDueDay ?? null,
    paymentDueCycleType: input.paymentDueCycleType ?? "BUSINESS_DAY",
    minimumPaymentPercent: input.minimumPaymentPercent ?? null,
    cards: input.cards ?? [],
    createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

/**
 * Fake `IdempotencyRecordRepositoryPort` backed by a real in-memory map keyed
 * on `(userId, key)` — a genuine second `reserve()` call for the same pair
 * comes back `EXISTS`, exactly like the `@@unique([userId, key])` collision
 * the real adapter relies on. This is what makes a handler under test
 * actually replay on a retry instead of running twice, so a spec does not
 * have to hand-roll that plumbing (see `RegisterDebtPaymentHandler`'s
 * "replays … instead of registering twice" for the pattern).
 *
 * True concurrent-request mutual exclusion is NOT what this proves — that
 * only proves out against a real Postgres unique constraint (see
 * `test/integration/domains/idempotency-record`). This fake is for the
 * sequential replay/collision *decision* logic, which is deterministic.
 */
export function fakeIdempotencyRecordRepo(
  overrides: Partial<IdempotencyRecordRepositoryPort> = {},
): IdempotencyRecordRepositoryPort {
  const rows = new Map<string, ReturnType<IdempotencyRecord["snapshot"]>>();
  let seq = 0;
  const rowKey = (userId: string, key: string) => `${userId}:${key}`;

  return {
    reserve: vi.fn(async (userId, plan) => {
      const k = rowKey(userId, plan.key);
      const existing = rows.get(k);
      if (existing) {
        return { kind: "EXISTS" as const, record: IdempotencyRecord.fromPersistence(existing) };
      }
      const props = { ...plan, id: `ir${++seq}`, userId };
      rows.set(k, props);
      return { kind: "RESERVED" as const, record: IdempotencyRecord.fromPersistence(props) };
    }),
    findByKey: vi.fn(async (userId, key) => {
      const row = rows.get(rowKey(userId, key));
      return row ? IdempotencyRecord.fromPersistence(row) : null;
    }),
    completeWithTx: vi.fn(async (_tx, id, body, status) => {
      for (const [k, row] of rows) {
        if (row.id === id) {
          rows.set(k, { ...row, status: "COMPLETED", responseBody: body, responseStatus: status });
          return;
        }
      }
    }),
    release: vi.fn(async (id) => {
      for (const [k, row] of rows) {
        if (row.id === id) {
          rows.delete(k);
          return;
        }
      }
    }),
    takeOver: vi.fn(async (id, plan) => {
      for (const [k, row] of rows) {
        if (row.id === id) {
          const next = { ...row, ...plan, id: row.id, userId: row.userId };
          rows.set(k, next);
          return IdempotencyRecord.fromPersistence(next);
        }
      }
      throw new Error(`fakeIdempotencyRecordRepo.takeOver: no row with id ${id}`);
    }),
    deleteExpired: vi.fn(async () => 0),
    ...overrides,
  };
}

/** Fake `PrismaService`, sufficient for a handler that only calls
 * `$transaction(cb)` to enlist its `*WithTx` calls — `cb` runs immediately
 * against an opaque marker, since the fake repos it is passed to don't
 * inspect it. */
export function fakePrismaTransaction(): {
  $transaction: (cb: (tx: unknown) => unknown) => unknown;
} {
  return { $transaction: (cb) => cb({ __fakeTx: true }) };
}
