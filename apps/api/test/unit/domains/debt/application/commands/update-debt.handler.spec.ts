import { describe, expect, it, vi } from "vitest";

import { UpdateDebtHandler } from "../../../../../../src/domains/debt/application/commands/update-debt.handler";
import { UpdateDebtCommand } from "../../../../../../src/domains/debt/application/commands/update-debt.command";
import { RemoveDebtHandler } from "../../../../../../src/domains/debt/application/commands/remove-debt.handler";
import { RemoveDebtCommand } from "../../../../../../src/domains/debt/application/commands/remove-debt.command";
import { AccountNotFoundError } from "../../../../../../src/domains/bank-account/domain/errors";
import type { BankAccountLookupPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account-lookup.port";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import { DebtNotFoundError } from "../../../../../../src/domains/debt/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";

function makeDebt() {
  return Debt.fromPersistence({
    id: "d1",
    userId: "u1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1240.5",
    currency: "USD",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    dueAt: null,
    interestApr: null,
    notes: null,
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

function fakeRepo(overrides: Partial<DebtRepositoryPort> = {}): DebtRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    findOneForUpdateWithTx: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function fakeAccounts(overrides: Partial<BankAccountLookupPort> = {}): BankAccountLookupPort {
  return {
    accountOwned: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("UpdateDebtHandler", () => {
  it("throws DebtNotFoundError for a missing debt", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateDebtHandler({ publish: vi.fn() } as never, repo, fakeAccounts());
    await expect(
      handler.execute(new UpdateDebtCommand("u1", "ghost", { counterparty: "New" })),
    ).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("applies the patch and persists it", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt()), save });
    const handler = new UpdateDebtHandler({ publish: vi.fn() } as never, repo, fakeAccounts());
    const result = await handler.execute(
      new UpdateDebtCommand("u1", "d1", { counterparty: "New name" }),
    );
    expect(result.counterparty).toBe("New name");
    expect(save).toHaveBeenCalled();
  });

  it("rejects a paymentAccountId that doesn't belong to the caller", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt()) });
    const handler = new UpdateDebtHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts({ accountOwned: vi.fn().mockResolvedValue(false) }),
    );
    await expect(
      handler.execute(
        new UpdateDebtCommand("u1", "d1", { paymentAccountId: "someone-elses-account" }),
      ),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});

describe("RemoveDebtHandler", () => {
  it("throws DebtNotFoundError when nothing was removed", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RemoveDebtCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      DebtNotFoundError,
    );
  });

  it("removes the debt", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveDebtHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveDebtCommand("u1", "d1"));
    expect(remove).toHaveBeenCalledWith("u1", "d1");
  });
});
