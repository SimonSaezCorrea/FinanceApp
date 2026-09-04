import { describe, expect, it, vi } from "vitest";

import type { BankAccountLookupPort } from "../../../../../../src/domains/bank-account/domain/ports/bank-account-lookup.port";
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
    category: null,
    frequency: "MONTHLY",
    interval: 1,
    anchorDate: new Date("2026-01-05T00:00:00Z"),
    bankAccountId: null,
    active: true,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

function fakeRepo(
  overrides: Partial<RecurringExpenseRepositoryPort> = {},
): RecurringExpenseRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
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

describe("UpdateRecurringExpenseHandler", () => {
  it("throws RecurringExpenseNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateRecurringExpenseHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeAccounts(),
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
    );

    const result = await handler.execute(
      new UpdateRecurringExpenseCommand("u1", "r1", { active: false, label: "Arriendo depto" }),
    );

    expect(result.active).toBe(false);
    expect(result.label).toBe("Arriendo depto");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
