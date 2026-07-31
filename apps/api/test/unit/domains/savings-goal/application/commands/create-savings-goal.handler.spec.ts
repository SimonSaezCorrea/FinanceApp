import { describe, expect, it, vi } from "vitest";

import { CreateSavingsGoalHandler } from "../../../../../../src/domains/savings-goal/application/commands/create-savings-goal.handler";
import { CreateSavingsGoalCommand } from "../../../../../../src/domains/savings-goal/application/commands/create-savings-goal.command";
import { SavingsGoal } from "../../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import type { SavingsGoalRepositoryPort } from "../../../../../../src/domains/savings-goal/domain/ports/savings-goal.repository.port";

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

describe("CreateSavingsGoalHandler", () => {
  it("plans the goal and persists it via the repository", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      SavingsGoal.fromPersistence({
        id: "g1",
        userId,
        ...plan,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateSavingsGoalHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new CreateSavingsGoalCommand("u1", {
        title: "Emergency fund",
        targetAmount: "5000",
        currency: "USD",
        deadline: "2026-12-31T00:00:00.000Z",
      }),
    );

    expect(result.id).toBe("g1");
    expect(result.title).toBe("Emergency fund");
    expect(result.targetAmount).toBe("5000.0000");
    expect(create).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ title: "Emergency fund", currency: "USD" }),
    );
    expect(create.mock.calls[0]![1].deadline).toBeInstanceOf(Date);
  });

  it("defaults deadline to null when not provided", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      SavingsGoal.fromPersistence({
        id: "g1",
        userId,
        ...plan,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateSavingsGoalHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new CreateSavingsGoalCommand("u1", { title: "Trip", targetAmount: "1000", currency: "USD" }),
    );

    expect(result.deadline).toBeNull();
  });
});
