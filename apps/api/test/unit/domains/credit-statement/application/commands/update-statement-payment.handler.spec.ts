import { describe, expect, it, vi } from "vitest";

import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import { UpdateStatementPaymentCommand } from "../../../../../../src/domains/credit-statement/application/commands/update-statement-payment.command";
import { UpdateStatementPaymentHandler } from "../../../../../../src/domains/credit-statement/application/commands/update-statement-payment.handler";
import {
  CreditStatement,
  type CreditStatementProps,
} from "../../../../../../src/domains/credit-statement/domain/credit-statement.aggregate";
import { StatementPaymentCurrencyAmbiguousError } from "../../../../../../src/domains/credit-statement/domain/errors";
import type { BankAccountRepositoryPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { CreditStatementRepositoryPort } from "../../../../../../src/domains/credit-statement/domain/ports/credit-statement.repository.port";
import { fakeTransactionWriterRepo } from "../../../../support/fake-ports";

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
    cards: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A USD statement of US$50,41 paid in full from account `acc_2`. */
function paidUsd(overrides: Partial<CreditStatementProps> = {}): CreditStatementProps {
  return {
    id: "st_1",
    accountId: "acc_1",
    periodStart: new Date("2026-08-21"),
    closedAt: new Date("2026-09-17"),
    paidAt: new Date("2026-10-01"),
    amount: "50.41",
    paidAmount: "50.41",
    carriedOverAmount: "0",
    prepaidAmount: "0",
    carriedToId: null,
    paidFromAccountId: "acc_2",
    paidTransactionId: "tx_expense",
    currency: "USD",
    transferredAt: null,
    transferredAmount: null,
    transferTransactionId: null,
    settlementTransactionId: "tx_income",
    transferredToId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(
  opts: {
    fromCurrency?: string;
    statement?: Partial<CreditStatementProps>;
    oldCharged?: string | null;
  } = {},
) {
  const account = BankAccount.fromPersistence(accountProps());
  const from = BankAccount.fromPersistence(
    accountProps({
      id: "acc_2",
      type: "CHECKING",
      currency: opts.fromCurrency ?? "CLP",
      cards: [],
    }),
  );
  const statement = CreditStatement.fromPersistence(paidUsd(opts.statement));
  const accountRepo = {
    findById: vi.fn(async (_u: string, id: string) => (id === "acc_1" ? account : from)),
    incrementBalanceWithTx: vi.fn(),
    incrementCreditUsedWithTx: vi.fn(),
    saveWithTx: vi.fn(),
  } as unknown as BankAccountRepositoryPort;
  const statementRepo = {
    findById: vi.fn(async () => statement),
    breakdown: vi.fn(async () => ({ purchases: "50.41", installments: "0", installmentCount: 0 })),
    saveWithTx: vi.fn(),
    findOrCreateCarryOverTargetWithTx: vi.fn(async () => ({ id: "st_next" })),
    addCarriedOverWithTx: vi.fn(),
  } as unknown as CreditStatementRepositoryPort;
  const transactions = fakeTransactionWriterRepo({
    amountForTransaction: vi.fn(async () =>
      opts.oldCharged === undefined ? "49394.0000" : opts.oldCharged,
    ),
  });
  const prisma = { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => cb({})) };
  const handler = new UpdateStatementPaymentHandler(
    { publish: vi.fn() } as never,
    statementRepo,
    accountRepo,
    transactions,
    prisma as never,
  );
  const update = (amount: string, chargedAmount?: string) =>
    handler.execute(
      new UpdateStatementPaymentCommand("u1", "acc_1", "st_1", amount, chargedAmount),
    );
  return { account, statement, accountRepo, statementRepo, transactions, update };
}

describe("UpdateStatementPaymentHandler — statement in another currency (spec 030)", () => {
  it("corrects both movements, the source balance by the pesos difference, and never the pool", async () => {
    const { update, transactions, accountRepo, account } = setup();

    const result = await update("40", "39200");

    expect(transactions.updateAmountWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "tx_expense",
      "39200",
    );
    expect(transactions.updateAmountWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "tx_income",
      "40.0000",
    );
    // 49.394 left before, 39.200 now: 10.194 pesos come back.
    expect(accountRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc_2",
      "10194.0000",
    );
    expect(account.creditUsed).toBe("300000.0000");
    expect(accountRepo.incrementCreditUsedWithTx).not.toHaveBeenCalled();
    expect(accountRepo.saveWithTx).not.toHaveBeenCalled();
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("moves the shortfall carried into the next period of the same currency", async () => {
    const { update, statementRepo } = setup();

    await update("40", "39200");

    expect(statementRepo.findOrCreateCarryOverTargetWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currency: "USD" }),
    );
    expect(statementRepo.addCarriedOverWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "st_next",
      "10.4100",
    );
  });

  it("needs the new pesos figure when the source account is in another currency", async () => {
    const { update, transactions } = setup();

    await expect(update("40")).rejects.toThrow(StatementPaymentCurrencyAmbiguousError);
    expect(transactions.updateAmountWithTx).not.toHaveBeenCalled();
  });

  it("a source account in the statement's own currency follows the paid amount (one figure)", async () => {
    const { update, transactions, accountRepo } = setup({
      fromCurrency: "USD",
      oldCharged: "50.4100",
    });

    await update("40");

    expect(transactions.updateAmountWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "tx_expense",
      "40.0000",
    );
    expect(accountRepo.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc_2",
      "10.4100",
    );
  });

  it("a statement settled in bookkeeping only (imported, no movements) just corrects the statement", async () => {
    const { update, transactions, accountRepo, statementRepo } = setup({
      statement: {
        paidTransactionId: null,
        settlementTransactionId: null,
        paidFromAccountId: null,
      },
      oldCharged: null,
    });

    await update("40");

    expect(transactions.updateAmountWithTx).not.toHaveBeenCalled();
    expect(accountRepo.incrementBalanceWithTx).not.toHaveBeenCalled();
    expect(statementRepo.saveWithTx).toHaveBeenCalled();
  });
});
