import { fakeCategoryLookup } from "../../../../support/fake-ports";
import { describe, expect, it, vi } from "vitest";

import type { BankAccountLookupPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account-lookup.port";
import type { CardAccountRepositoryPort } from "../../../../../../src/domains/card-account/domain/ports/card-account.repository.port";
import { UpdateRecurringExpenseHandler } from "../../../../../../src/domains/recurring-expense/application/commands/update-recurring-expense.handler";
import { UpdateRecurringExpenseCommand } from "../../../../../../src/domains/recurring-expense/application/commands/update-recurring-expense.command";
import { RecurringExpense } from "../../../../../../src/domains/recurring-expense/domain/recurring-expense.aggregate";
import { RecurringExpenseNotFoundError } from "../../../../../../src/domains/recurring-expense/domain/errors";
import type { RecurringExpenseRepositoryPort } from "../../../../../../src/domains/recurring-expense/domain/ports/recurring-expense.repository.port";

function makeExpense() {
  return RecurringExpense.fromPersistence({
    id: "r1",
    userId: "u1",
    label: "Arriendo",
    amount: "520000",
    currency: "CLP",
    categoryId: null,
    frequency: "MONTHLY",
    interval: 1,
    anchorDate: new Date("2026-01-05T00:00:00Z"),
    bankAccountId: null,
    cardId: null,
    active: true,
    endDate: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

function fakeRepo(
  overrides: Partial<RecurringExpenseRepositoryPort> = {},
): RecurringExpenseRepositoryPort {
  return {
    countForUser: vi.fn(async () => 0),
    deleteAllForUserWithTx: vi.fn(async () => {}),
    listIdsForAccount: vi.fn(async () => []),
    removeManyWithTx: vi.fn(),
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    createWithTx: vi.fn(),
    save: vi.fn(),
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

function fakeCards(overrides: Partial<CardAccountRepositoryPort> = {}): CardAccountRepositoryPort {
  return {
    createWithTx: vi.fn(async () => "card"),
    countForUser: vi.fn(async () => 0),
    listByAccounts: vi.fn(),
    findOnAccount: vi.fn(),
    existsForUser: vi.fn().mockResolvedValue(true),
    accountIdForCard: vi.fn(),
    kindForCard: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("UpdateRecurringExpenseHandler", () => {
  it("throws RecurringExpenseNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateRecurringExpenseHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
      fakeCards(),
      fakeCategoryLookup(),
    );
    await expect(
      handler.execute(new UpdateRecurringExpenseCommand("u1", "ghost", {})),
    ).rejects.toBeInstanceOf(RecurringExpenseNotFoundError);
  });

  it("patches the provided fields and persists via save", async () => {
    const save = vi.fn();
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeExpense()), save });
    const handler = new UpdateRecurringExpenseHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
      fakeCards(),
      fakeCategoryLookup(),
    );

    const result = await handler.execute(
      new UpdateRecurringExpenseCommand("u1", "r1", { active: false, label: "Arriendo depto" }),
    );

    expect(result.active).toBe(false);
    expect(result.label).toBe("Arriendo depto");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
