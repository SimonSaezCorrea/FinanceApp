import { describe, expect, it, vi } from "vitest";

import { RemoveRecurringExpenseHandler } from "../../../../../../src/domains/recurring-expense/application/commands/remove-recurring-expense.handler";
import { RemoveRecurringExpenseCommand } from "../../../../../../src/domains/recurring-expense/application/commands/remove-recurring-expense.command";
import { RecurringExpenseNotFoundError } from "../../../../../../src/domains/recurring-expense/domain/errors";
import type { RecurringExpenseRepositoryPort } from "../../../../../../src/domains/recurring-expense/domain/ports/recurring-expense.repository.port";

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

describe("RemoveRecurringExpenseHandler", () => {
  it("throws RecurringExpenseNotFoundError when the repository reports nothing removed", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveRecurringExpenseHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new RemoveRecurringExpenseCommand("u1", "ghost")),
    ).rejects.toBeInstanceOf(RecurringExpenseNotFoundError);
  });

  it("removes scoped to the user", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveRecurringExpenseHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveRecurringExpenseCommand("u1", "r1"));
    expect(remove).toHaveBeenCalledWith("u1", "r1");
  });
});
