import { describe, expect, it, vi } from "vitest";

import { UpdateSavingsGoalHandler } from "../../../../../../src/domains/savings-goal/application/commands/update-savings-goal.handler";
import { UpdateSavingsGoalCommand } from "../../../../../../src/domains/savings-goal/application/commands/update-savings-goal.command";
import { SavingsGoal } from "../../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import {
  SavingsGoalCurrencyLockedError,
  SavingsGoalNotFoundError,
} from "../../../../../../src/domains/savings-goal/domain/errors";
import { fakeSavingsEntryRepo, fakeSavingsGoalRepo } from "../../../../../unit/support/fake-ports";

function makeGoal() {
  return SavingsGoal.fromPersistence({
    id: "g1",
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

describe("UpdateSavingsGoalHandler", () => {
  it("throws SavingsGoalNotFoundError when missing", async () => {
    const repo = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const entries = fakeSavingsEntryRepo();
    const handler = new UpdateSavingsGoalHandler({ publish: vi.fn() } as never, repo, entries);
    await expect(
      handler.execute(new UpdateSavingsGoalCommand("u1", "ghost", {})),
    ).rejects.toBeInstanceOf(SavingsGoalNotFoundError);
  });

  it("patches the provided fields and persists via save", async () => {
    const save = vi.fn();
    const repo = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(makeGoal()), save });
    const entries = fakeSavingsEntryRepo({ countByGoal: vi.fn().mockResolvedValue(0) });
    const handler = new UpdateSavingsGoalHandler({ publish: vi.fn() } as never, repo, entries);

    const result = await handler.execute(
      new UpdateSavingsGoalCommand("u1", "g1", { title: "New title", targetAmount: "6000" }),
    );

    expect(result.title).toBe("New title");
    expect(result.targetAmount).toBe("6000.0000");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rejects a currency change once the goal has entries", async () => {
    const repo = fakeSavingsGoalRepo({ findOne: vi.fn().mockResolvedValue(makeGoal()) });
    const entries = fakeSavingsEntryRepo({ countByGoal: vi.fn().mockResolvedValue(3) });
    const handler = new UpdateSavingsGoalHandler({ publish: vi.fn() } as never, repo, entries);

    await expect(
      handler.execute(new UpdateSavingsGoalCommand("u1", "g1", { currency: "CLP" })),
    ).rejects.toBeInstanceOf(SavingsGoalCurrencyLockedError);
  });
});
