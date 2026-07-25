import { describe, expect, it, vi } from "vitest";

import { CreateRecurringExpenseHandler } from "../../../../../../src/domains/recurring/application/commands/create-recurring-expense.handler";
import { CreateRecurringExpenseCommand } from "../../../../../../src/domains/recurring/application/commands/create-recurring-expense.command";
import { RecurringExpense } from "../../../../../../src/domains/recurring/domain/recurring-expense.aggregate";
import type { RecurringExpenseRepositoryPort } from "../../../../../../src/domains/recurring/domain/ports/recurring-expense.repository.port";

function fakeRepo(overrides: Partial<RecurringExpenseRepositoryPort> = {}): RecurringExpenseRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("CreateRecurringExpenseHandler", () => {
  it("plans the recurring expense and persists it via the repository", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      RecurringExpense.fromPersistence({
        id: "r1",
        userId,
        ...plan,
        createdAt: plan.anchorDate,
        updatedAt: plan.anchorDate,
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateRecurringExpenseHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new CreateRecurringExpenseCommand("u1", {
        label: "Arriendo",
        amount: "520000",
        currency: "CLP",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: "2026-01-05T00:00:00.000Z",
      }),
    );

    expect(result.id).toBe("r1");
    expect(result.label).toBe("Arriendo");
    expect(typeof result.nextDueAt).toBe("string");
    expect(create).toHaveBeenCalledWith("u1", expect.objectContaining({ label: "Arriendo", active: true }));
  });
});
