import { describe, expect, it, vi } from "vitest";
import { fakeTransactionSumsRepo } from "../../../../support/fake-ports";

import { GetAccountQueryHandler } from "../../../../../../src/domains/bank-account/application/queries/get-account.handler";
import { GetAccountQuery } from "../../../../../../src/domains/bank-account/application/queries/get-account.query";
import {
  BankAccount,
  type BankAccountProps,
} from "../../../../../../src/domains/bank-account/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../../../../src/domains/bank-account/domain/errors";
import type { BankAccountRepositoryPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account.repository.port";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";

function fakePlanRepo(
  overrides: Partial<InstallmentPlanRepositoryPort> = {},
): InstallmentPlanRepositoryPort {
  return {
    list: vi.fn(async () => []),
    findOne: vi.fn(),
    create: vi.fn(),
    createWithTx: vi.fn(),
    listBillableForCards: vi.fn(),
    stampBillableWithTx: vi.fn(),
    settleForStatementWithTx: vi.fn(),
    billedInstallmentsForStatement: vi.fn(),
    save: vi.fn(),
    savePaymentWithTx: vi.fn(),
    setPaymentPaidAt: vi.fn(),
    remove: vi.fn(),
    removeWithTx: vi.fn(),
    ...overrides,
  };
}

function accountProps(overrides: Partial<BankAccountProps> = {}): BankAccountProps {
  return {
    id: "acc_1",
    userId: "u1",
    name: "Checking",
    type: "CHECKING",
    status: "ACTIVE",
    currency: "CLP",
    institution: null,
    institutionId: null,
    institutionName: null,
    accountNumber: "123",
    accountAlias: null,
    initialBalance: "1000",
    overdraftLimit: "0",
    balanceCeiling: null,
    currentBalance: "1000",
    creditLimit: "0",
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

describe("GetAccountQueryHandler", () => {
  it("returns the account DTO, shaped with a balance series", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const handler = new GetAccountQueryHandler(
      accountRepo,
      fakeTransactionSumsRepo(),
      fakePlanRepo(),
    );

    const dto = await handler.execute(new GetAccountQuery("u1", "acc_1"));

    expect(dto.id).toBe("acc_1");
    expect(dto.balanceSeries).toHaveLength(30);
    expect(dto.creditPools).toEqual([]);
  });

  it("throws AccountNotFoundError for a missing account", async () => {
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => null) });
    const handler = new GetAccountQueryHandler(
      accountRepo,
      fakeTransactionSumsRepo(),
      fakePlanRepo(),
    );

    await expect(handler.execute(new GetAccountQuery("u1", "missing"))).rejects.toThrow(
      AccountNotFoundError,
    );
  });
});
