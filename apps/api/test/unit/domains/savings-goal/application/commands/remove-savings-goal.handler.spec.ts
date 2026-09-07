import { describe, expect, it, vi } from "vitest";

import { RemoveSavingsGoalHandler } from "../../../../../../src/domains/savings-goal/application/commands/remove-savings-goal.handler";
import { RemoveSavingsGoalCommand } from "../../../../../../src/domains/savings-goal/application/commands/remove-savings-goal.command";
import { SavingsGoalNotFoundError } from "../../../../../../src/domains/savings-goal/domain/errors";
import { fakeSavingsGoalRepo as fakeRepo } from "../../../../../unit/support/fake-ports";

describe("RemoveSavingsGoalHandler", () => {
  it("throws SavingsGoalNotFoundError when the repository reports nothing removed", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveSavingsGoalHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new RemoveSavingsGoalCommand("u1", "ghost")),
    ).rejects.toBeInstanceOf(SavingsGoalNotFoundError);
  });

  it("removes scoped to the user", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveSavingsGoalHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveSavingsGoalCommand("u1", "g1"));
    expect(remove).toHaveBeenCalledWith("u1", "g1");
  });
});
