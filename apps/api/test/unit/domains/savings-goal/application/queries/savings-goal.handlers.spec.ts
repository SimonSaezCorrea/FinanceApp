import { describe, expect, it, vi } from "vitest";

import { GetSavingsGoalQueryHandler } from "../../../../../../src/domains/savings-goal/application/queries/get-savings-goal.handler";
import { GetSavingsGoalQuery } from "../../../../../../src/domains/savings-goal/application/queries/get-savings-goal.query";
import { ListSavingsGoalsQueryHandler } from "../../../../../../src/domains/savings-goal/application/queries/list-savings-goals.handler";
import { ListSavingsGoalsQuery } from "../../../../../../src/domains/savings-goal/application/queries/list-savings-goals.query";
import { SavingsGoal } from "../../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import { SavingsGoalNotFoundError } from "../../../../../../src/domains/savings-goal/domain/errors";
import { fakeSavingsEntryRepo, fakeSavingsGoalRepo } from "../../../../../unit/support/fake-ports";

function makeGoal(id: string) {
  return SavingsGoal.fromPersistence({
    id,
    userId: "u1",
    title: "Emergency fund",
    targetAmount: "5000",
    currency: "USD",
    deadline: null,
    notes: null,
    color: null,
    closedAt: null,
    closeDestination: null,
    closeAccountId: null,
    closeTransactionId: null,
    closeAmount: null,
    closeTargetGoalId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("GetSavingsGoalQueryHandler", () => {
  it("throws SavingsGoalNotFoundError when missing", async () => {
    const repo = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const entries = fakeSavingsEntryRepo();
    const handler = new GetSavingsGoalQueryHandler(repo, entries);
    await expect(handler.execute(new GetSavingsGoalQuery("u1", "ghost"))).rejects.toBeInstanceOf(
      SavingsGoalNotFoundError,
    );
  });

  it("returns the goal as a contract", async () => {
    const repo = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(makeGoal("g1")) });
    const entries = fakeSavingsEntryRepo();
    const handler = new GetSavingsGoalQueryHandler(repo, entries);
    const result = await handler.execute(new GetSavingsGoalQuery("u1", "g1"));
    expect(result.id).toBe("g1");
    expect(result.targetAmount).toBe("5000.0000");
    expect(result.savedAmount).toBe("0.0000");
  });
});

describe("ListSavingsGoalsQueryHandler", () => {
  it("lists the user's goals as contracts", async () => {
    const repo = fakeSavingsGoalRepo({
      list: vi.fn().mockResolvedValue([makeGoal("g1"), makeGoal("g2")]),
    });
    const entries = fakeSavingsEntryRepo();
    const handler = new ListSavingsGoalsQueryHandler(repo, entries);
    const result = await handler.execute(new ListSavingsGoalsQuery("u1"));
    expect(result.map((g) => g.id)).toEqual(["g1", "g2"]);
  });
});
