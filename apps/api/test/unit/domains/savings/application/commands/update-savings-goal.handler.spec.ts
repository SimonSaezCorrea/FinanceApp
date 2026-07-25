import { describe, expect, it, vi } from "vitest";

import { UpdateSavingsGoalHandler } from "../../../../../../src/domains/savings/application/commands/update-savings-goal.handler";
import { UpdateSavingsGoalCommand } from "../../../../../../src/domains/savings/application/commands/update-savings-goal.command";
import { SavingsGoal } from "../../../../../../src/domains/savings/domain/savings-goal.aggregate";
import { SavingsGoalNotFoundError } from "../../../../../../src/domains/savings/domain/errors";
import type { SavingsGoalRepositoryPort } from "../../../../../../src/domains/savings/domain/ports/savings-goal.repository.port";

function makeGoal() {
  return SavingsGoal.fromPersistence({
    id: "g1",
    userId: "u1",
    title: "Emergency fund",
    targetAmount: "5000",
    currency: "USD",
    deadline: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

function fakeRepo(overrides: Partial<SavingsGoalRepositoryPort> = {}): SavingsGoalRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("UpdateSavingsGoalHandler", () => {
  it("throws SavingsGoalNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateSavingsGoalHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new UpdateSavingsGoalCommand("u1", "ghost", {})),
    ).rejects.toBeInstanceOf(SavingsGoalNotFoundError);
  });

  it("patches the provided fields and persists via save", async () => {
    const save = vi.fn();
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeGoal()), save });
    const handler = new UpdateSavingsGoalHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new UpdateSavingsGoalCommand("u1", "g1", { title: "New title", targetAmount: "6000" }),
    );

    expect(result.title).toBe("New title");
    expect(result.targetAmount).toBe("6000.0000");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
