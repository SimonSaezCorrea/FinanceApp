import { describe, expect, it, vi } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import { PrepayOpenPeriodCommand } from "../../../../../../src/domains/credit-statement/application/commands/prepay-open-period.command";
import { PrepayOpenPeriodHandler } from "../../../../../../src/domains/credit-statement/application/commands/prepay-open-period.handler";
import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import {
  CardLimitNotFoundError,
  PaymentExceedsRemainingError,
  StatementNotOpenError,
  StatementPaymentCurrencyAmbiguousError,
} from "../../../../../../src/domains/credit-statement/domain/errors";
import type { BankAccountRepositoryPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { CreditStatementRepositoryPort } from "../../../../../../src/domains/credit-statement/domain/ports/credit-statement.repository.port";
import {
  fakeCategoryLookup,
  fakeIdempotencyRecordRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

const card = (overrides: Record<string, unknown> = {}) => ({
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

function accountProps(overrides: Partial<BankAccountProps> = {}): BankAccountProps {
  return {
    id: "acc_1",
    userId: "u1",
    name: "BCI Platinum",
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
    creditLimit: "900000",
    creditUsedInitial: "0",
    creditUsed: "300000",
    billingCycleDay: null,
    billingCycleType: "BUSINESS_DAY",
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
    periodStart: new Date("2026-09-18"),
    closedAt: null,
    paidAt: null,
    amount: "0",
    paidAmount: "0",
    carriedOverAmount: "0",
    prepaidAmount: "0",
    carriedToId: null,
    paidFromAccountId: null,
    paidTransactionId: null,
    currency: "USD",
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

function setup(
  opts: {
    statement?: Partial<CreditStatementProps>;
    cards?: ReturnType<typeof card>[];
    fromCurrency?: string;
    owed?: string;
  } = {},
) {
  const creditAccount = BankAccount.fromPersistence(
    accountProps({ cards: opts.cards ?? [card()] }),
  );
  const fromAccount = BankAccount.fromPersistence(
    accountProps({
      id: "acc_2",
      type: "CHECKING",
      creditLimit: "0",
      creditUsed: "0",
      currency: opts.fromCurrency ?? "CLP",
      name: "Cuenta corriente",
      cards: [],
    }),
  );
  const statement = CreditStatement.fromPersistence(statementProps(opts.statement));
  const accountRepo = {
    findById: vi.fn(async (_u: string, id: string) =>
      id === "acc_1" ? creditAccount : fromAccount,
    ),
    incrementBalanceWithTx: vi.fn(),
    incrementCreditUsedWithTx: vi.fn(),
    saveWithTx: vi.fn(),
  } as unknown as BankAccountRepositoryPort;
  const statementRepo = {
    findById: vi.fn(async () => statement),
    findByIdForUpdateWithTx: vi.fn(async () => statement),
    breakdown: vi.fn(async () => ({
      purchases: opts.owed ?? "50.41",
      installments: "0",
      installmentCount: 0,
    })),
    saveWithTx: vi.fn(),
  } as unknown as CreditStatementRepositoryPort;
  const transactions = fakeTransactionWriterRepo();
  const prisma = { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})) };
  const handler = new PrepayOpenPeriodHandler(
    { publish: vi.fn() } as never,
    fakeIdempotencyRecordRepo(),
    accountRepo,
    statementRepo,
    transactions,
    prisma as never,
    fakeCategoryLookup(),
  );
  let calls = 0;
  const prepay = (amount: string, chargedAmount?: string) =>
    handler.execute(
      new PrepayOpenPeriodCommand(
        "u1",
        "acc_1",
        "st_1",
        "acc_2",
        amount,
        // A distinct key per call: a reused one would be replayed, not executed.
        `test-key-${String(++calls).padStart(13, "0")}`,
        undefined,
        undefined,
        chargedAmount,
      ),
    );
  return { creditAccount, statement, accountRepo, statementRepo, transactions, prepay };
}

const created = (transactions: ReturnType<typeof fakeTransactionWriterRepo>) =>
  vi.mocked(transactions.createWithTx).mock.calls.map((c) => c[1]);

describe("PrepayOpenPeriodHandler — period in another currency (spec 030)", () => {
  it("needs the amount debited when the source account is in another currency", async () => {
    const { prepay, transactions } = setup();

    await expect(prepay("20")).rejects.toThrow(StatementPaymentCurrencyAmbiguousError);
    expect(transactions.createWithTx).not.toHaveBeenCalled();
  });

  it("records the pesos that left and a USD settlement, raises prepaidAmount, closes nothing", async () => {
    const { prepay, transactions, statement, accountRepo, creditAccount } = setup();

    const result = await prepay("20", "19600");

    const [expense, income] = created(transactions);
    expect(expense).toMatchObject({
      bankAccountId: "acc_2",
      type: "EXPENSE",
      amount: "19600",
      currency: "CLP",
      categoryId: "system-CARD_PREPAYMENT",
      settlesStatementId: "st_1",
    });
    // Not a prepago of the account-currency kind (that kind reconciles `creditUsed` on edit),
    // but it still names the credit account its settlement belongs to.
    expect(expense!.prepaymentStatementId).toBeUndefined();
    expect(expense!.prepaymentAccountId).toBe("acc_1");
    expect(income).toMatchObject({
      bankAccountId: "acc_1",
      type: "INCOME",
      amount: "20",
      currency: "USD",
      cardId: "card_1",
      settlesStatementId: "st_1",
    });
    expect(statement.state.name).toBe("OPEN");
    expect(statement.closedAt).toBeNull();
    expect(result.prepaidAmount).toBe("20.0000");
    expect(result.status).toBe("OPEN");
    expect(accountRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc_2",
      "-19600.0000",
    );
    // The CLP pool is not this period's: it must not move.
    expect(creditAccount.creditUsed).toBe("300000.0000");
    expect(accountRepo.incrementCreditUsedWithTx).not.toHaveBeenCalled();
  });

  it("can be repeated before the period closes, up to what it owes", async () => {
    const { prepay, statement } = setup();

    await prepay("20", "19600");
    await prepay("30", "29400");

    expect(statement.prepaidAmount).toBe("50.0000");
    await expect(prepay("1", "980")).rejects.toThrow(PaymentExceedsRemainingError);
  });

  it("refuses more than the period owes, writing nothing", async () => {
    const { prepay, transactions } = setup();

    await expect(prepay("60", "58800")).rejects.toThrow(PaymentExceedsRemainingError);
    expect(transactions.createWithTx).not.toHaveBeenCalled();
  });

  it("a source account in the period's own currency needs one amount", async () => {
    const { prepay, transactions } = setup({ fromCurrency: "USD" });

    await prepay("20");

    const [expense, income] = created(transactions);
    expect(expense).toMatchObject({ type: "EXPENSE", amount: "20", currency: "USD" });
    expect(income).toMatchObject({ type: "INCOME", amount: "20", currency: "USD" });
  });

  it("refuses when the primary card holds no limit in that currency, writing nothing", async () => {
    const { prepay, transactions } = setup({ cards: [card({ limits: [] })] });

    await expect(prepay("20", "19600")).rejects.toThrow(CardLimitNotFoundError);
    expect(transactions.createWithTx).not.toHaveBeenCalled();
  });

  it("only an OPEN period can be prepaid", async () => {
    const { prepay } = setup({ statement: { closedAt: new Date("2026-10-01") } });

    await expect(prepay("20", "19600")).rejects.toThrow(StatementNotOpenError);
  });

  it("re-reads the period under a row lock, so concurrent prepayments serialize", async () => {
    const { prepay, statementRepo } = setup();

    await prepay("20", "19600");

    expect(statementRepo.findByIdForUpdateWithTx).toHaveBeenCalledTimes(1);
  });
});

describe("PrepayOpenPeriodHandler — period in the account's own currency (unchanged)", () => {
  it("still lowers the pool and tags the movement as a prepayment, ignoring chargedAmount", async () => {
    const { prepay, transactions, accountRepo, creditAccount } = setup({
      statement: { currency: "CLP" },
      owed: "100000",
      fromCurrency: "CLP",
    });

    await prepay("40000");

    const [expense, ...rest] = created(transactions);
    expect(rest).toHaveLength(0);
    expect(expense).toMatchObject({
      type: "EXPENSE",
      amount: "40000",
      prepaymentStatementId: "st_1",
      prepaymentAccountId: "acc_1",
    });
    expect(accountRepo.incrementCreditUsedWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc_1",
      "-40000.0000",
    );
    expect(creditAccount.creditUsed).toBe("300000.0000");
  });
});
