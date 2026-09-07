import { describe, expect, it } from "vitest";

import { SavingsGoal } from "../../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import {
  SavingsGoalAlreadyClosedError,
  SavingsGoalCurrencyLockedError,
  SavingsGoalNotClosedError,
  SavingsGoalNotCloseableError,
} from "../../../../../src/domains/savings-goal/domain/errors";

function makeGoal(overrides: Partial<Parameters<typeof SavingsGoal.fromPersistence>[0]> = {}) {
  return SavingsGoal.fromPersistence({
    id: "g1",
    userId: "u1",
    title: "Emergency fund",
    targetAmount: "5000",
    currency: "USD",
    deadline: new Date("2026-12-31T00:00:00Z"),
    notes: null,
    color: null,
    closedAt: null,
    closeDestination: null,
    closeAccountId: null,
    closeTransactionId: null,
    closeAmount: null,
    closeTargetGoalId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  });
}

const derived = { savedAmount: "0", pace: "0" };

describe("SavingsGoal.planCreation", () => {
  it("defaults deadline and notes to null when not provided", () => {
    const planned = SavingsGoal.planCreation({
      title: "Emergency fund",
      targetAmount: "5000",
      currency: "USD",
    });
    expect(planned.deadline).toBeNull();
    expect(planned.notes).toBeNull();
    expect(planned.closedAt).toBeNull();
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
    const contract = goal.toContract(derived);
    expect(contract).toEqual({
      id: "g1",
      title: "Emergency fund",
      targetAmount: "5000.0000",
      currency: "USD",
      deadline: "2026-12-31T00:00:00.000Z",
      notes: null,
      color: null,
      closedAt: null,
      closeDestination: null,
      closeAccountId: null,
      closeTargetGoalId: null,
      savedAmount: "0.0000",
      pace: "0.0000",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("returns null deadline unchanged", () => {
    const goal = makeGoal({ deadline: null });
    expect(goal.toContract(derived).deadline).toBeNull();
  });
});

describe("SavingsGoal.applyUpdate", () => {
  it("patches only the provided scalar fields", () => {
    const goal = makeGoal();
    goal.applyUpdate({ title: "New title", targetAmount: "6000" }, false);
    const contract = goal.toContract(derived);
    expect(contract.title).toBe("New title");
    expect(contract.targetAmount).toBe("6000.0000");
    expect(contract.currency).toBe("USD");
  });

  it("allows clearing deadline back to null", () => {
    const goal = makeGoal();
    goal.applyUpdate({ deadline: null }, false);
    expect(goal.toContract(derived).deadline).toBeNull();
  });

  it("allows changing currency when the goal has no entries", () => {
    const goal = makeGoal();
    goal.applyUpdate({ currency: "CLP" }, false);
    expect(goal.toContract(derived).currency).toBe("CLP");
  });

  it("rejects changing currency once the goal has entries", () => {
    const goal = makeGoal();
    expect(() => goal.applyUpdate({ currency: "CLP" }, true)).toThrow(
      SavingsGoalCurrencyLockedError,
    );
  });

  it("allows a no-op currency patch even with entries", () => {
    const goal = makeGoal({ currency: "USD" });
    expect(() => goal.applyUpdate({ currency: "USD" }, true)).not.toThrow();
  });
});

describe("SavingsGoal.close/reopen", () => {
  const now = new Date("2026-09-06T00:00:00Z");

  it("refuses to close a goal that is neither cumplida nor vencida", () => {
    const goal = makeGoal({ deadline: new Date("2027-01-01T00:00:00Z") });
    expect(() => goal.close(false, { destination: "FREE_SAVINGS", closedAt: now })).toThrow(
      SavingsGoalNotCloseableError,
    );
  });

  it("refuses to close an already-closed goal", () => {
    const goal = makeGoal({ closedAt: new Date("2026-08-01T00:00:00Z") });
    expect(() => goal.close(true, { destination: "FREE_SAVINGS", closedAt: now })).toThrow(
      SavingsGoalAlreadyClosedError,
    );
  });

  it("records a WITHDRAW_TO_ACCOUNT close as a reversible bookkeeping entry", () => {
    const goal = makeGoal();
    goal.close(true, {
      destination: "WITHDRAW_TO_ACCOUNT",
      closedAt: now,
      withdrawal: { transactionId: "tx1", accountId: "acc1", amount: "5000" },
    });
    const contract = goal.toContract(derived);
    expect(contract.closedAt).toBe(now.toISOString());
    expect(contract.closeDestination).toBe("WITHDRAW_TO_ACCOUNT");
  });

  it("reopen reverses a WITHDRAW_TO_ACCOUNT close and clears the bookkeeping", () => {
    const goal = makeGoal();
    goal.close(true, {
      destination: "WITHDRAW_TO_ACCOUNT",
      closedAt: now,
      withdrawal: { transactionId: "tx1", accountId: "acc1", amount: "5000" },
    });
    const reversed = goal.reopen();
    expect(reversed).toEqual({ transactionId: "tx1", accountId: "acc1", amount: "5000" });
    expect(goal.toContract(derived).closedAt).toBeNull();
    expect(goal.closedAt).toBeNull();
  });

  it("reopen returns null for a FREE_SAVINGS close (no money to reverse)", () => {
    const goal = makeGoal();
    goal.close(true, { destination: "FREE_SAVINGS", closedAt: now });
    expect(goal.reopen()).toBeNull();
  });

  it("refuses to reopen a goal that isn't closed", () => {
    const goal = makeGoal();
    expect(() => goal.reopen()).toThrow(SavingsGoalNotClosedError);
  });

  it("a goal without a deadline is never closeable while incomplete", () => {
    const goal = makeGoal({ deadline: null });
    expect(() => goal.close(false, { destination: "FREE_SAVINGS", closedAt: now })).toThrow(
      SavingsGoalNotCloseableError,
    );
  });
});
