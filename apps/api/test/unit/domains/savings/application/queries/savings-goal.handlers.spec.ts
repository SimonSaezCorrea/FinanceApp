import { describe, expect, it, vi } from "vitest";

import { GetSavingsGoalQueryHandler } from "../../../../../../src/domains/savings/application/queries/get-savings-goal.handler";
import { GetSavingsGoalQuery } from "../../../../../../src/domains/savings/application/queries/get-savings-goal.query";
import { ListSavingsGoalsQueryHandler } from "../../../../../../src/domains/savings/application/queries/list-savings-goals.handler";
import { ListSavingsGoalsQuery } from "../../../../../../src/domains/savings/application/queries/list-savings-goals.query";
import { SavingsGoal } from "../../../../../../src/domains/savings/domain/savings-goal.aggregate";
import { SavingsGoalNotFoundError } from "../../../../../../src/domains/savings/domain/errors";
import type { SavingsGoalRepositoryPort } from "../../../../../../src/domains/savings/domain/ports/savings-goal.repository.port";

function makeGoal(id: string) {
  return SavingsGoal.fromPersistence({
    id,
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

describe("GetSavingsGoalQueryHandler", () => {
  it("throws SavingsGoalNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new GetSavingsGoalQueryHandler(repo);
    await expect(handler.execute(new GetSavingsGoalQuery("u1", "ghost"))).rejects.toBeInstanceOf(
      SavingsGoalNotFoundError,
    );
  });

  it("returns the goal as a contract", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeGoal("g1")) });
    const handler = new GetSavingsGoalQueryHandler(repo);
    const result = await handler.execute(new GetSavingsGoalQuery("u1", "g1"));
    expect(result.id).toBe("g1");
    expect(result.targetAmount).toBe("5000.0000");
  });
});

describe("ListSavingsGoalsQueryHandler", () => {
  it("lists the user's goals as contracts", async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue([makeGoal("g1"), makeGoal("g2")]) });
    const handler = new ListSavingsGoalsQueryHandler(repo);
    const result = await handler.execute(new ListSavingsGoalsQuery("u1"));
    expect(result.map((g) => g.id)).toEqual(["g1", "g2"]);
  });
});
