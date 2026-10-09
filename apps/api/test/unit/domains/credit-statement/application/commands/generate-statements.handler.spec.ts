import { describe, expect, it, vi } from "vitest";

import { GenerateStatementsHandler } from "../../../../../../src/domains/credit-statement/application/commands/generate-statements.handler";
import { GenerateStatementsCommand } from "../../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
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
import type { TransactionWriterRepositoryPort } from "../../../../../../src/domains/transaction/domain/ports/transaction-writer.repository.port";
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
  return {
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
    listForAccount: vi.fn(async () => []),
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
    countForUser: vi.fn(async () => 0),
    deleteAllForUserWithTx: vi.fn(async () => {}),
    listIdsForAccount: vi.fn(async () => []),
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
    saveScheduleWithTx: vi.fn(),
    savePaymentWithTx: vi.fn(),
    setPaymentPaidAt: vi.fn(),
    remove: vi.fn(),
    removeWithTx: vi.fn(async () => true),
    ...overrides,
  };
}

function fakeWriter(): TransactionWriterRepositoryPort {
  return { relinkToStatementWithTx: vi.fn() } as unknown as TransactionWriterRepositoryPort;
}

const START = new Date("2026-01-01T00:00:00.000Z");
const CLOSE = new Date("2026-01-20T23:59:59.999Z");
const DUE = new Date("2026-02-05T23:59:59.999Z");

function build(
  opts: {
    account?: BankAccount;
    opens?: CreditStatement[];
    all?: CreditStatement[];
    plan?: Partial<InstallmentPlanRepositoryPort>;
  } = {},
) {
  const account = opts.account ?? BankAccount.fromPersistence(accountProps());
  const opens = opts.opens ?? [CreditStatement.fromPersistence(statementProps())];
  const statementRepo = fakeStatementRepo({
    listOpenForAccount: vi.fn(async () => opens),
    listForAccount: vi.fn(async () => opts.all ?? opens),
  });
  const planRepo = fakePlanRepo(opts.plan);
  const writer = fakeWriter();
  const handler = new GenerateStatementsHandler(
    { publish: vi.fn() } as never,
    fakeAccountRepo({ findById: vi.fn(async () => account) }),
    statementRepo,
    planRepo,
    writer,
    fakePrisma() as never,
  );
  return { handler, statementRepo, planRepo, writer, opens };
}

const cmd = (start = START, close = CLOSE, due = DUE) =>
  new GenerateStatementsCommand("u1", "acc_1", start, close, due);

describe("GenerateStatementsHandler (user-declared dates)", () => {
  it("seals the open period with the declared start, close and due date", async () => {
    const { handler, statementRepo, opens } = build();
    expect(await handler.execute(cmd())).toBe(true);
    const [s] = opens;
    expect(s!.periodStart).toEqual(START);
    expect(s!.closedAt).toEqual(CLOSE);
    expect(s!.dueDate).toEqual(DUE);
    expect(statementRepo.saveWithTx).toHaveBeenCalledWith(expect.anything(), s);
  });

  it("links the window to the period and moves later movements to the next one", async () => {
    const { handler, writer, statementRepo } = build();
    await handler.execute(cmd());
    expect(statementRepo.findOrCreateCarryOverTargetWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodStart: new Date(CLOSE.getTime() + 1), currency: "CLP" }),
    );
    expect(writer.relinkToStatementWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statementId: "st_1", from: START, to: CLOSE }),
    );
    expect(writer.relinkToStatementWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statementId: "st_next", from: CLOSE }),
    );
  });

  it("closes every currency's open period with the same dates", async () => {
    const opens = [
      CreditStatement.fromPersistence(statementProps()),
      CreditStatement.fromPersistence(statementProps({ id: "st_usd", currency: "USD" })),
    ];
    const { handler } = build({ opens });
    await handler.execute(cmd());
    expect(opens.every((s) => s.closedAt?.getTime() === CLOSE.getTime())).toBe(true);
  });

  it("stamps the instalments due by the close on the account-currency period", async () => {
    const listBillableForCards = vi.fn(async () => [
      { paymentId: "p1", dueDate: new Date("2026-01-05") },
    ]);
    const { handler, planRepo } = build({ plan: { listBillableForCards } as never });
    await handler.execute(cmd());
    expect(listBillableForCards).toHaveBeenCalledWith(["card_1"], CLOSE);
    expect(planRepo.stampBillableWithTx).toHaveBeenCalledWith(expect.anything(), ["p1"], "st_1");
  });

  it("refuses a start before the account's last close", async () => {
    const previous = CreditStatement.fromPersistence(
      statementProps({ id: "st_old", closedAt: new Date("2026-01-10T23:59:59.999Z") }),
    );
    const { handler } = build({ all: [previous] });
    await expect(handler.execute(cmd())).rejects.toMatchObject({
      code: "STATEMENT_PERIOD_OVERLAPS",
    });
  });

  it("accepts a close still ahead, refuses dates out of order", async () => {
    const { handler } = build();
    const ahead = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await expect(handler.execute(cmd(START, ahead, ahead))).resolves.toBe(true);
    await expect(handler.execute(cmd(CLOSE, START, DUE))).rejects.toMatchObject({
      code: "STATEMENT_DATES_INVALID",
    });
    await expect(handler.execute(cmd(START, CLOSE, START))).rejects.toMatchObject({
      code: "STATEMENT_DATES_INVALID",
    });
  });

  it("refuses an account that can't be billed", async () => {
    const account = BankAccount.fromPersistence(accountProps({ type: "CHECKING", cards: [] }));
    const { handler } = build({ account });
    await expect(handler.execute(cmd())).rejects.toMatchObject({
      code: "STATEMENT_GENERATION_NOT_ALLOWED",
    });
  });
});
