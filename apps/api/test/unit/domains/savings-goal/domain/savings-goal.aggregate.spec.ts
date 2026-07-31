import { describe, expect, it } from "vitest";

import { SavingsGoal } from "../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";

function makeGoal(overrides: Partial<Parameters<typeof SavingsGoal.fromPersistence>[0]> = {}) {
  return SavingsGoal.fromPersistence({
    id: "g1",
    userId: "u1",
    title: "Emergency fund",
    targetAmount: "5000",
    currency: "USD",
    deadline: new Date("2026-12-31T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  });
}

describe("SavingsGoal.planCreation", () => {
  it("defaults deadline to null when not provided", () => {
    const planned = SavingsGoal.planCreation({
      title: "Emergency fund",
      targetAmount: "5000",
      currency: "USD",
    });
    expect(planned.deadline).toBeNull();
  });

  it("keeps an explicit deadline", () => {
    const deadline = new Date("2026-12-31T00:00:00Z");
    const planned = SavingsGoal.planCreation({
      title: "Emergency fund",
      targetAmount: "5000",
      currency: "USD",
      deadline,
    });
    expect(planned.deadline).toBe(deadline);
  });
});

describe("SavingsGoal.toContract", () => {
  it("maps money as a fixed decimal string and dates as ISO", () => {
    const goal = makeGoal();
    const contract = goal.toContract();
    expect(contract).toEqual({
      id: "g1",
      title: "Emergency fund",
      targetAmount: "5000.0000",
      currency: "USD",
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("returns null deadline unchanged", () => {
    const goal = makeGoal({ deadline: null });
    expect(goal.toContract().deadline).toBeNull();
  });
});

describe("SavingsGoal.applyUpdate", () => {
  it("patches only the provided scalar fields", () => {
    const goal = makeGoal();
    goal.applyUpdate({ title: "New title", targetAmount: "6000" });
    const contract = goal.toContract();
    expect(contract.title).toBe("New title");
    expect(contract.targetAmount).toBe("6000.0000");
    expect(contract.currency).toBe("USD");
  });

  it("allows clearing deadline back to null", () => {
    const goal = makeGoal();
    goal.applyUpdate({ deadline: null });
    expect(goal.toContract().deadline).toBeNull();
  });
});
