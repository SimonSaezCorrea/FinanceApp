import { fakeCategoryLookup } from "../../../../support/fake-ports";
import { describe, expect, it, vi } from "vitest";
import {
  fakeIdempotencyRecordRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

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
  CardLimitNotFoundError,
  InvalidPaymentSourceError,
  NothingToPayError,
  PaymentExceedsRemainingError,
  StatementAlreadyPaidError,
  StatementPaymentCurrencyAmbiguousError,
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
    paymentDueCycleType: "BUSINESS_DAY",
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
    prepaidAmount: "0",
    carriedToId: null,
    paidFromAccountId: null,
    paidTransactionId: null,
    currency: "CLP",
    transferredAt: null,
    transferredAmount: null,
    transferTransactionId: null,
    settlementTransactionId: null,
    transferredToId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeAccountRepo(
  overrides: Partial<BankAccountRepositoryPort> = {},
): BankAccountRepositoryPort {
  return {
    createWithCardsWithTx: vi.fn(async () => ({ id: "acc", cardIds: [] })),
    setStatusWithTx: vi.fn(async () => {}),
    countForUser: vi.fn(async () => 0),
    deleteAllForUserWithTx: vi.fn(async () => {}),
    removeWithTx: vi.fn(async () => true),
    findById: vi.fn(),
    listByUser: vi.fn(),
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
    adjustOpeningWithTx: vi.fn(),
    ...overrides,
  };
}

function fakeStatementRepo(
  overrides: Partial<CreditStatementRepositoryPort> = {},
): CreditStatementRepositoryPort {
  const merged: CreditStatementRepositoryPort = {
    listDueScheduled: vi.fn(async () => []),
    countForUser: vi.fn(async () => 0),
    paymentTransactionIdsFromOtherAccounts: vi.fn(async () => []),
    findById: vi.fn(),
    findByIdForUpdateWithTx: vi.fn(),
    findOpenForAccount: vi.fn(),
    listOpenForAccount: vi.fn(async () => []),
    findOrCreateOpenForAccount: vi.fn(async () => ({ id: "st_open" })),
    findOrCreateOpenForAccountWithTx: vi.fn(async () => ({ id: "st_open" })),
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
  // `PayCreditStatementHandler` re-reads the period under a lock inside its transaction
  // (spec 030, concurrent payments). A spec that only stubs `findById` means the same row.
  if (!overrides.findByIdForUpdateWithTx && overrides.findById) {
    const findById = overrides.findById;
    merged.findByIdForUpdateWithTx = vi.fn(
      async (_tx: unknown, ...args: Parameters<typeof findById>) => findById(...args),
    );
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
    unstampDueAfterWithTx: vi.fn(),
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
      breakdown: vi.fn(async () => ({
        purchases: "10000",
        installments: "0",
        installmentCount: 0,
      })),
    });
    const prisma = fakePrisma();

    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
      prisma as never,
      fakeCategoryLookup(),
    );

    const result = await handler.execute(
      new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2", "test-key-0000000000001"),
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
      fakeIdempotencyRecordRepo(),
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
      fakePrisma() as never,
      fakeCategoryLookup(),
    );
    await expect(
      handler.execute(
        new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_3", "test-key-0000000000001"),
      ),
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
      fakeIdempotencyRecordRepo(),
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
      fakePrisma() as never,
      fakeCategoryLookup(),
    );
    await expect(
      handler.execute(
        new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2", "test-key-0000000000001"),
      ),
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
      fakeIdempotencyRecordRepo(),
      accountRepo,
      statementRepo,
      fakeTransactionWriterRepo(),
      fakePlanRepo(),
      fakePrisma() as never,
      fakeCategoryLookup(),
    );

    const result = await handler.execute(
      new PayCreditStatementCommand(
        "u1",
        "acc_1",
        "st_1",
        "acc_2",
        "test-key-0000000000001",
        "4000",
      ),
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
        fakeIdempotencyRecordRepo(),
        accountRepo,
        statementRepo,
        fakeTransactionWriterRepo(),
        planRepo,
        fakePrisma() as never,
        fakeCategoryLookup(),
      );

      await handler.execute(
        new PayCreditStatementCommand("u1", "acc_1", "st_1", "acc_2", "test-key-0000000000001"),
      );

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
        fakeIdempotencyRecordRepo(),
        accountRepo,
        statementRepo,
        fakeTransactionWriterRepo(),
        planRepo,
        fakePrisma() as never,
        fakeCategoryLookup(),
      );

      const result = await handler.execute(
        new PayCreditStatementCommand(
          "u1",
          "acc_1",
          "st_1",
          "acc_2",
          "test-key-0000000000001",
          "4000",
        ),
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
          fakeIdempotencyRecordRepo(),
          accountRepo,
          statementRepo,
          fakeTransactionWriterRepo(),
          fakePlanRepo({ settleForStatementWithTx }),
          fakePrisma() as never,
          fakeCategoryLookup(),
        );
        await handler.execute(
          new PayCreditStatementCommand(
            "u1",
            "acc_1",
            "st_1",
            "acc_2",
            "test-key-0000000000001",
            amount,
          ),
        );
        return settleForStatementWithTx.mock.calls.length;
      };

      expect(await settleCallsFor(undefined)).toBe(1); // full payment -> PAID
      expect(await settleCallsFor("4000")).toBe(1); // short payment -> PARTIALLY_PAID
    });
  });
});

// --- spec 030 (absorbs 028 US2): paying a statement in ANOTHER currency ---

describe("PayCreditStatementHandler — statement in another currency", () => {
  const usdCard = (overrides: Record<string, unknown> = {}) => ({
    id: "card_1",
    name: "Visa",
    kind: "CREDIT" as const,
    last4: "7774",
    expiryMonth: 6,
    expiryYear: 2031,
    isActive: true,
    isPrimary: true,
    isVirtual: false,
    isAdditional: false,
    cardholderName: null,
    network: null,
    limits: [{ id: "lim_1", currency: "USD", limitAmount: "100", usedInitial: "0" }],
    ...overrides,
  });

  function setup(
    opts: {
      cards?: ReturnType<typeof usdCard>[];
      fromCurrency?: string;
      statement?: Partial<CreditStatementProps>;
      owed?: string;
    } = {},
  ) {
    const creditAccount = BankAccount.fromPersistence(
      accountProps({ cards: opts.cards ?? [usdCard()] }),
    );
    const fromAccount = BankAccount.fromPersistence(
      accountProps({
        id: "acc_2",
        type: "CHECKING",
        creditLimit: "0",
        currency: opts.fromCurrency ?? "CLP",
        name: "Cuenta corriente",
      }),
    );
    const statement = CreditStatement.fromPersistence(
      statementProps({ currency: "USD", ...opts.statement }),
    );
    const accountRepo = fakeAccountRepo({
      findById: vi.fn(async (_u: string, id: string) =>
        id === "acc_1" ? creditAccount : fromAccount,
      ),
      incrementBalanceWithTx: vi.fn(),
      incrementCreditUsedWithTx: vi.fn(),
    });
    const statementRepo = fakeStatementRepo({
      findById: vi.fn(async () => statement),
      findByIdForUpdateWithTx: vi.fn(async () => statement),
      breakdown: vi.fn(async () => ({
        purchases: opts.owed ?? "50.41",
        installments: "0",
        installmentCount: 0,
      })),
    });
    const transactions = fakeTransactionWriterRepo();
    const handler = new PayCreditStatementHandler(
      { publish: vi.fn() } as never,
      fakeIdempotencyRecordRepo(),
      accountRepo,
      statementRepo,
      transactions,
      fakePlanRepo(),
      fakePrisma() as never,
      fakeCategoryLookup(),
    );
    const pay = (amount?: string, chargedAmount?: string) =>
      handler.execute(
        new PayCreditStatementCommand(
          "u1",
          "acc_1",
          "st_1",
          "acc_2",
          "test-key-0000000000001",
          amount,
          undefined,
          undefined,
          chargedAmount,
        ),
      );
    return { creditAccount, fromAccount, statement, accountRepo, statementRepo, transactions, pay };
  }

  const created = (transactions: ReturnType<typeof fakeTransactionWriterRepo>) =>
    vi.mocked(transactions.createWithTx).mock.calls.map((c) => c[1]);

  it("needs the amount debited when the source account is in another currency", async () => {
    const { pay, transactions } = setup();

    await expect(pay()).rejects.toThrow(StatementPaymentCurrencyAmbiguousError);
    expect(transactions.createWithTx).not.toHaveBeenCalled();
  });

  it("records the pesos that left the source and a USD settlement on the card that owns the limit", async () => {
    const { pay, transactions, statement, accountRepo, creditAccount } = setup();

    const result = await pay(undefined, "49394");

    const [expense, income] = created(transactions);
    expect(expense).toMatchObject({
      bankAccountId: "acc_2",
      type: "EXPENSE",
      amount: "49394",
      currency: "CLP",
      categoryId: "system-STATEMENT_PAYMENT",
    });
    expect(income).toMatchObject({
      bankAccountId: "acc_1",
      type: "INCOME",
      amount: "50.4100",
      currency: "USD",
      cardId: "card_1",
      settlesStatementId: "st_1",
      creditStatementId: null,
    });
    expect(statement.paidTransactionId).toBe(expense!.id);
    expect(statement.settlementTransactionId).toBe(income!.id);
    expect(result.status).toBe("PAID");
    expect(accountRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc_2",
      "-49394.0000",
    );
    // The CLP pool is not this statement's: it must not move.
    expect(creditAccount.creditUsed).toBe("50000.0000");
    expect(accountRepo.incrementCreditUsedWithTx).not.toHaveBeenCalled();
  });

  it("a source account in the statement's own currency needs one amount", async () => {
    const { pay, transactions } = setup({ fromCurrency: "USD" });

    await pay();

    const [expense, income] = created(transactions);
    expect(expense).toMatchObject({ type: "EXPENSE", amount: "50.4100", currency: "USD" });
    expect(income).toMatchObject({ type: "INCOME", amount: "50.4100", currency: "USD" });
  });

  it("a short payment carries the shortfall into the OPEN period of the SAME currency", async () => {
    const { pay, statementRepo, statement } = setup();

    const result = await pay("30", "28500");

    expect(statementRepo.findOrCreateCarryOverTargetWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accountId: "acc_1", currency: "USD" }),
    );
    expect(statementRepo.addCarriedOverWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "st_next",
      "20.4100",
    );
    expect(statement.carriedToId).toBe("st_next");
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("refuses paying more dollars than the period owes", async () => {
    const { pay, transactions } = setup();

    await expect(pay("60", "57000")).rejects.toThrow(PaymentExceedsRemainingError);
    expect(transactions.createWithTx).not.toHaveBeenCalled();
  });

  it("refuses when the primary card holds no limit in that currency, writing nothing", async () => {
    const { pay, transactions } = setup({ cards: [usdCard({ limits: [] })] });

    await expect(pay(undefined, "49394")).rejects.toThrow(CardLimitNotFoundError);
    expect(transactions.createWithTx).not.toHaveBeenCalled();
  });

  it("always settles on the PRIMARY card, never on an additional one holding a limit too", async () => {
    const extra = usdCard({ id: "card_2", isPrimary: false, isAdditional: true });
    const { pay, transactions } = setup({ cards: [extra, usdCard()] });

    await pay(undefined, "49394");

    expect(created(transactions)[1]).toMatchObject({ cardId: "card_1" });
  });

  it("re-reads the statement under a row lock inside the transaction (concurrent payments)", async () => {
    const { pay, statementRepo } = setup();

    await pay(undefined, "49394");

    expect(statementRepo.findByIdForUpdateWithTx).toHaveBeenCalledTimes(1);
  });

  it("a second payment against an already-settled period is refused", async () => {
    const { pay } = setup({
      statement: { paidAt: new Date("2026-02-05"), amount: "50.41", paidAmount: "50.41" },
    });

    await expect(pay(undefined, "49394")).rejects.toThrow(StatementAlreadyPaidError);
  });
});
