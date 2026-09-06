import { describe, expect, it, vi } from "vitest";

import { GetRecurringExpenseQueryHandler } from "../../../../../../src/domains/recurring-expense/application/queries/get-recurring-expense.handler";
import { GetRecurringExpenseQuery } from "../../../../../../src/domains/recurring-expense/application/queries/get-recurring-expense.query";
import { ListRecurringExpensesQueryHandler } from "../../../../../../src/domains/recurring-expense/application/queries/list-recurring-expenses.handler";
import { ListRecurringExpensesQuery } from "../../../../../../src/domains/recurring-expense/application/queries/list-recurring-expenses.query";
import { RecurringExpense } from "../../../../../../src/domains/recurring-expense/domain/recurring-expense.aggregate";
import { RecurringExpenseNotFoundError } from "../../../../../../src/domains/recurring-expense/domain/errors";
import type { RecurringExpenseRepositoryPort } from "../../../../../../src/domains/recurring-expense/domain/ports/recurring-expense.repository.port";

function makeExpense(id: string) {
  return RecurringExpense.fromPersistence({
    id,
    userId: "u1",
    label: "Arriendo",
    amount: "520000",
    currency: "CLP",
    category: null,
    frequency: "MONTHLY",
    interval: 1,
    anchorDate: new Date("2026-01-05T00:00:00Z"),
    bankAccountId: null,
    cardId: null,
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

describe("GetRecurringExpenseQueryHandler", () => {
  it("throws RecurringExpenseNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new GetRecurringExpenseQueryHandler(repo);
    await expect(
      handler.execute(new GetRecurringExpenseQuery("u1", "ghost")),
    ).rejects.toBeInstanceOf(RecurringExpenseNotFoundError);
  });

  it("returns the recurring expense as a contract, incl. computed nextDueAt", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeExpense("r1")) });
    const handler = new GetRecurringExpenseQueryHandler(repo);
    const result = await handler.execute(new GetRecurringExpenseQuery("u1", "r1"));
    expect(result.id).toBe("r1");
    expect(typeof result.nextDueAt).toBe("string");
  });
});

describe("ListRecurringExpensesQueryHandler", () => {
  it("lists the user's recurring expenses as contracts", async () => {
    const repo = fakeRepo({
      list: vi.fn().mockResolvedValue([makeExpense("r1"), makeExpense("r2")]),
    });
    const handler = new ListRecurringExpensesQueryHandler(repo);
    const result = await handler.execute(new ListRecurringExpensesQuery("u1"));
    expect(result.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});
