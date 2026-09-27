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
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";

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
    billingCycleDay: 5,
    billingCycleType: "CALENDAR_DAY",
    paymentMethod: "MANUAL",
    paymentDueDay: null,
    paymentDueCycleType: "BUSINESS_DAY",
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
    adjustOpeningWithTx: vi.fn(),
    ...overrides,
  };
}

function fakeStatementRepo(
  overrides: Partial<CreditStatementRepositoryPort> = {},
): CreditStatementRepositoryPort {
  return {
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
    sumLinkedTransactions: vi.fn(),
    breakdown: vi.fn(async () => ({ purchases: "0", installments: "0", installmentCount: 0 })),
    ...overrides,
  };
}

/** `$transaction(cb)` just runs the callback: real atomicity is the integration
 * tier's job (test/integration/domains/credit-statement). */
function fakePrisma() {
  return { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})) };
}

function fakePlanRepo(
  overrides: Partial<InstallmentPlanRepositoryPort> = {},
): InstallmentPlanRepositoryPort {
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
    saveScheduleWithTx: vi.fn(),
    savePaymentWithTx: vi.fn(),
    setPaymentPaidAt: vi.fn(),
    remove: vi.fn(),
    removeWithTx: vi.fn(async () => true),
    ...overrides,
  };
}

describe("GenerateStatementsHandler (manual trigger)", () => {
  it("closes a due OPEN statement for an eligible account", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({
      listOpenForAccount: vi.fn(async () => [statement]),
      save: vi.fn(async () => undefined),
    });
    const planRepo = fakePlanRepo();
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      planRepo,
      fakePrisma() as never,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(closed).toBe(true);
    expect(statement.state.name).toBe("PENDING");
    expect(statementRepo.saveWithTx).toHaveBeenCalledWith(expect.anything(), statement);
  });

  it("does nothing when no statement is OPEN (no usage since last close)", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({ listOpenForAccount: vi.fn(async () => []) });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakePlanRepo(),
      fakePrisma() as never,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));
    expect(closed).toBe(false);
  });

  it("does nothing for an INACTIVE account (leaves it accumulating)", async () => {
    const account = BankAccount.fromPersistence(accountProps({ status: "INACTIVE" }));
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({ listOpenForAccount: vi.fn(async () => [statement]) });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakePlanRepo(),
      fakePrisma() as never,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));
    expect(closed).toBe(false);
    expect(statement.state.name).toBe("OPEN");
  });

  // --- spec 014: FR-008/FR-009 -- closing stamps the period's billable instalments ---

  it("stamps the billable instalments of the account's CREDIT cards when it closes", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({
      listOpenForAccount: vi.fn(async () => [statement]),
      saveWithTx: vi.fn(async () => undefined),
    });
    const stampBillableWithTx = vi.fn();
    const planRepo = fakePlanRepo({
      listBillableForCards: vi.fn(async (cardIds: string[]) =>
        cardIds.includes("card_1")
          ? [
              {
                planId: "plan1",
                paymentId: "pay1",
                sequence: 1,
                dueDate: new Date("2020-01-05"),
                amount: "90000",
                currency: "CLP",
                creditStatementId: null,
              },
            ]
          : [],
      ),
      stampBillableWithTx,
    });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      planRepo,
      fakePrisma() as never,
    );

    await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(planRepo.listBillableForCards).toHaveBeenCalledWith(["card_1"], expect.any(Date));
    expect(stampBillableWithTx).toHaveBeenCalledWith(expect.anything(), ["pay1"], "st_1");
  });

  it("stamps nothing, and never calls the plan repo, for an account with no CREDIT card", async () => {
    const account = BankAccount.fromPersistence(accountProps({ cards: [card({ kind: "DEBIT" })] }));
    const statement = CreditStatement.fromPersistence(statementProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const statementRepo = fakeStatementRepo({
      listOpenForAccount: vi.fn(async () => [statement]),
      saveWithTx: vi.fn(async () => undefined),
    });
    const listBillableForCards = vi.fn();
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakePlanRepo({ listBillableForCards }),
      fakePrisma() as never,
    );

    await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(listBillableForCards).not.toHaveBeenCalled();
  });

  // --- spec 014: a plan can be an account's ONLY activity ---
  //
  // The plan's purchase movement deliberately never links to a statement (FR-007),
  // so an account whose only activity is a credit-card instalment plan never gets
  // an OPEN period through the ordinary path (that only happens when some OTHER
  // movement is recorded). Without a fix, such an account could never bill its
  // instalments at all — this is what proves the fix closes that gap.
  it("opens a period from the schedule alone when no OPEN one exists but instalments are due", async () => {
    const account = BankAccount.fromPersistence(accountProps()); // no findOpenForAccount hit yet
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const opened = CreditStatement.fromPersistence(
      statementProps({ id: "st_seeded", periodStart: new Date("2020-01-04") }),
    );
    const findOrCreateOpenForAccount = vi.fn(async () => ({ id: "st_seeded" }));
    const statementRepo = fakeStatementRepo({
      // Nothing open yet; once seeded from the schedule, the seeded one is found.
      listOpenForAccount: vi.fn(async () => []),
      findOpenForAccount: vi.fn(async () => opened),
      findOrCreateOpenForAccount,
      saveWithTx: vi.fn(async () => undefined),
    });
    const stampBillableWithTx = vi.fn();
    const planRepo = fakePlanRepo({
      listBillableForCards: vi.fn(async () => [
        {
          planId: "plan1",
          paymentId: "pay1",
          sequence: 1,
          dueDate: new Date("2020-01-05"),
          amount: "90000",
          currency: "CLP",
          creditStatementId: null,
        },
      ]),
      stampBillableWithTx,
    });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      planRepo,
      fakePrisma() as never,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(findOrCreateOpenForAccount).toHaveBeenCalledWith("acc_1", expect.any(Date), "CLP");
    expect(closed).toBe(true);
    expect(stampBillableWithTx).toHaveBeenCalledWith(expect.anything(), ["pay1"], "st_seeded");
  });

  it("does nothing when no OPEN period exists and no instalment is due either", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const findOrCreateOpenForAccount = vi.fn();
    const statementRepo = fakeStatementRepo({
      listOpenForAccount: vi.fn(async () => []),
      findOrCreateOpenForAccount,
    });
    const planRepo = fakePlanRepo({ listBillableForCards: vi.fn(async () => []) });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      planRepo,
      fakePrisma() as never,
    );

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(closed).toBe(false);
    expect(findOrCreateOpenForAccount).not.toHaveBeenCalled();
  });
});

describe("GenerateStatementsHandler — one period per currency (spec 028)", () => {
  function handlerFor(statements: CreditStatement[], planRepo = fakePlanRepo()) {
    const account = BankAccount.fromPersistence(accountProps());
    const statementRepo = fakeStatementRepo({
      listOpenForAccount: vi.fn(async () => statements),
      saveWithTx: vi.fn(async () => undefined),
    });
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      fakeAccountRepo({ findById: vi.fn(async () => account) }),
      statementRepo,
      planRepo,
      fakePrisma() as never,
    );
    return { handler, statementRepo };
  }

  it("closes the CLP and the USD period together, with the SAME closedAt", async () => {
    const clp = CreditStatement.fromPersistence(statementProps({ id: "st_clp" }));
    const usd = CreditStatement.fromPersistence(statementProps({ id: "st_usd", currency: "USD" }));
    const { handler, statementRepo } = handlerFor([clp, usd]);

    const closed = await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(closed).toBe(true);
    expect(clp.state.name).toBe("PENDING");
    expect(usd.state.name).toBe("PENDING");
    expect(usd.closedAt?.getTime()).toBe(clp.closedAt?.getTime());
    expect(statementRepo.saveWithTx).toHaveBeenCalledTimes(2);
  });

  it("closes a USD-only cycle (no CLP usage) and never creates an empty CLP period", async () => {
    const usd = CreditStatement.fromPersistence(statementProps({ id: "st_usd", currency: "USD" }));
    const { handler, statementRepo } = handlerFor([usd]);

    expect(await handler.execute(new GenerateStatementsCommand("u1", "acc_1"))).toBe(true);
    expect(usd.state.name).toBe("PENDING");
    expect(statementRepo.findOrCreateOpenForAccount).not.toHaveBeenCalled();
  });

  it("stamps instalments only on the account-currency period", async () => {
    const clp = CreditStatement.fromPersistence(statementProps({ id: "st_clp" }));
    const usd = CreditStatement.fromPersistence(statementProps({ id: "st_usd", currency: "USD" }));
    const stampBillableWithTx = vi.fn();
    const planRepo = fakePlanRepo({
      listBillableForCards: vi.fn(async () => [
        {
          planId: "plan1",
          paymentId: "pay1",
          sequence: 1,
          dueDate: new Date("2020-01-05"),
          amount: "90000",
          currency: "CLP",
          creditStatementId: null,
        },
      ]),
      stampBillableWithTx,
    });
    const { handler } = handlerFor([clp, usd], planRepo);

    await handler.execute(new GenerateStatementsCommand("u1", "acc_1"));

    expect(stampBillableWithTx).toHaveBeenCalledTimes(1);
    expect(stampBillableWithTx).toHaveBeenCalledWith(expect.anything(), ["pay1"], "st_clp");
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
      listOpenForAccount: vi.fn(async (accountId: string) =>
        accountId === "acc_1" ? [statement1] : [statement2],
      ),
      save: vi.fn(async () => undefined),
    });
    const handler = new GenerateAllDueStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      fakePlanRepo(),
      fakePrisma() as never,
    );

    const count = await handler.execute(new GenerateAllDueStatementsCommand());

    expect(count).toBe(2);
    expect(statement1.state.name).toBe("PENDING");
    expect(statement2.state.name).toBe("PENDING");
  });
});
