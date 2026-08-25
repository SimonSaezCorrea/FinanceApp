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
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";

function accountProps(overrides: Partial<BankAccountProps> = {}): BankAccountProps {
  return {
    id: "acc_1",
    userId: "u1",
    name: "Credit line",
    type: "CREDIT_CARD",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: null,
    accountAlias: null,
    initialBalance: "0",
    overdraftLimit: "0",
    balanceCeiling: null,
    currentBalance: "0",
    creditLimit: "100000",
    creditUsedInitial: "0",
    creditUsed: "50000",
    billingCycleDay: null,
    billingCycleType: "BUSINESS_DAY",
    paymentMethod: "MANUAL",
    paymentDueDay: null,
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
    closedAt: new Date("2026-02-01"),
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

function fakeStatementRepo(
  overrides: Partial<CreditStatementRepositoryPort> = {},
): CreditStatementRepositoryPort {
  const merged: CreditStatementRepositoryPort = {
    findById: vi.fn(),
    findOpenForAccount: vi.fn(),
    findOrCreateOpenForAccount: vi.fn(async () => ({ id: "st_open" })),
    findOrCreateCarryOverTargetWithTx: vi.fn(async () => ({ id: "st_next" })),
    addCarriedOverWithTx: vi.fn(),
    isPaid: vi.fn(async () => false),
    listForAccount: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    sumLinkedTransactions: vi.fn(async () => "0"),
    breakdown: vi.fn(async () => ({ purchases: "0", installments: "0", installmentCount: 0 })),
    ...overrides,
  };
  // `PayCreditStatementHandler` now sources the period's total from `breakdown`
  // rather than `sumLinkedTransactions` (spec 014, FR-010). A caller that only
  // overrode the latter — as every pre-014 test here does — must still see it
  // reflected, or the handler sees "0" and refuses with `NothingToPayError`.
  if (overrides.sumLinkedTransactions && !overrides.breakdown) {
    merged.breakdown = vi.fn(async () => ({
      purchases: await merged.sumLinkedTransactions(""),
      installments: "0",
      installmentCount: 0,
    }));
  }
  return merged;
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

function fakePlanRepo(overrides: Partial<InstallmentPlanRepositoryPort> = {}) {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    createWithTx: vi.fn(),
    listBillableForCards: vi.fn(async () => []),
    stampBillableWithTx: vi.fn(),
    settleForStatementWithTx: vi.fn(),
    billedInstallmentsForStatement: vi.fn(async () => ({ amount: "0", count: 0 })),
    save: vi.fn(),
    savePaymentWithTx: vi.fn(),
    setPaymentPaidAt: vi.fn(),
    remove: vi.fn(),
    removeWithTx: vi.fn(async () => true),
    ...overrides,
  } as InstallmentPlanRepositoryPort;
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
      breakdown: vi.fn(async () => ({ purchases: "10000", installments: "0", installmentCount: 0 })),
    });
    const prisma = fakePrisma();

    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
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

  it("rejects paying from a CREDIT_CARD source account", async () => {
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
      fakePlanRepo(),
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
      breakdown: vi.fn(async () => ({ purchases: "0", installments: "0", installmentCount: 0 })),
    });
    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
      fakePrisma() as never,
    );
    await expect(
      handler.execute(new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2")),
    ).rejects.toThrow(NothingToPayError);
  });
  it("a partial payment settles the period and rolls the shortfall into the next one", async () => {
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
    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
      fakePrisma() as never,
    );

    const result = await handler.execute(
      new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2", "4000"),
    );

    // Settled and owing nothing further HERE — reported as PARTIALLY_PAID
    // because the payment covered 4000 of the period's 10000.
    expect(result.status).toBe("PARTIALLY_PAID");
    expect(result.remainingAmount).toBe("0.0000");
    expect(statement.carriedToId).toBe("st_next");
    expect(statementRepo.addCarriedOverWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "st_next",
      "6000.0000",
    );
    // Only the 4000 actually paid comes off the pool; the 6000 is still used.
    expect(creditAccount.creditUsed).toBe("46000.0000");
  });

  // --- spec 014: settling a period settles the instalments it charged ---

  describe("settling a period's instalments (FR-014, FR-015)", () => {
    it("settles every instalment the period charged when paid in full", async () => {
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
      const settleForStatementWithTx = vi.fn();
      const planRepo = fakePlanRepo({ settleForStatementWithTx });
      const handler = new PayCreditStatementHandler(
        { publish: vi.fn() } as never,
        accountRepo,
        statementRepo,
        fakeTransactionWriterRepo(),
        planRepo,
        fakePrisma() as never,
      );

      await handler.execute(new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2"));

      expect(settleForStatementWithTx).toHaveBeenCalledWith(
        expect.anything(),
        "st_1",
        expect.any(Date),
      );
    });

    // FR-015 — the case the spec singled out: a SHORT payment must ALSO settle the
    // instalments. The shortfall lives only in the successor period's carry-over;
    // leaving the instalment unpaid would count the same debt twice.
    it("settles the instalments even when the payment is short", async () => {
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
      const settleForStatementWithTx = vi.fn();
      const planRepo = fakePlanRepo({ settleForStatementWithTx });
      const handler = new PayCreditStatementHandler(
        { publish: vi.fn() } as never,
        accountRepo,
        statementRepo,
        fakeTransactionWriterRepo(),
        planRepo,
        fakePrisma() as never,
      );

      const result = await handler.execute(
        new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2", "4000"),
      );

      // The period itself reports PARTIALLY_PAID (a status NAME) — but "settle the
      // instalments" must not be gated on that name. It is called unconditionally.
      expect(result.status).toBe("PARTIALLY_PAID");
      expect(settleForStatementWithTx).toHaveBeenCalledWith(
        expect.anything(),
        "st_1",
        expect.any(Date),
      );
    });

    // FR-014a: "settled" is a fact about payment (`paidAt !== null`), never a status
    // NAME — the project already hit this trap once (PARTIALLY_PAID vs PAID). This
    // test would catch a regression that gated settling on `state.name === "PAID"`.
    it("settles instalments identically whether the period ends up PAID or PARTIALLY_PAID", async () => {
      const settleCallsFor = async (amount?: string) => {
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
        const settleForStatementWithTx = vi.fn();
        const handler = new PayCreditStatementHandler(
          { publish: vi.fn() } as never,
          accountRepo,
          statementRepo,
          fakeTransactionWriterRepo(),
          fakePlanRepo({ settleForStatementWithTx }),
          fakePrisma() as never,
        );
        await handler.execute(new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2", amount));
        return settleForStatementWithTx.mock.calls.length;
      };

      expect(await settleCallsFor(undefined)).toBe(1); // full payment -> PAID
      expect(await settleCallsFor("4000")).toBe(1); // short payment -> PARTIALLY_PAID
    });
  });
});
