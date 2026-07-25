import { describe, expect, it, vi } from "vitest";

import { GetAccountQueryHandler } from "../../../../../../src/domains/accounts/application/queries/get-account.handler";
import { GetAccountQuery } from "../../../../../../src/domains/accounts/application/queries/get-account.query";
import { BankAccount, type BankAccountProps } from "../../../../../../src/domains/accounts/domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../../../../../src/domains/accounts/domain/errors";
import type { BankAccountRepositoryPort } from "../../../../../../src/domains/accounts/domain/ports/bank-account.repository.port";

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
    initialBalance: "1000",
    currentBalance: "1000",
    creditLimit: "0",
    creditUsedInitial: "0",
    creditUsed: "0",
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    cards: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeAccountRepo(overrides: Partial<BankAccountRepositoryPort> = {}): BankAccountRepositoryPort {
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
    sumByType: vi.fn(),
    txWindow: vi.fn(async () => []),
    cardSums: vi.fn(async () => []),
    ...overrides,
  };
}

describe("GetAccountQueryHandler", () => {
  it("returns the account DTO, shaped with a balance series", async () => {
    const account = BankAccount.fromPersistence(accountProps());
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => account) });
    const handler = new GetAccountQueryHandler(accountRepo);

    const dto = await handler.execute(new GetAccountQuery("u1", "acc_1"));

    expect(dto.id).toBe("acc_1");
    expect(dto.balanceSeries).toHaveLength(30);
    expect(dto.creditPools).toEqual([]);
  });

  it("throws AccountNotFoundError for a missing account", async () => {
    const accountRepo = fakeAccountRepo({ findById: vi.fn(async () => null) });
    const handler = new GetAccountQueryHandler(accountRepo);

    await expect(handler.execute(new GetAccountQuery("u1", "missing"))).rejects.toThrow(AccountNotFoundError);
  });
});
