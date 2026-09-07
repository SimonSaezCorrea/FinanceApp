import { describe, expect, it } from "vitest";

import type { savings } from "@finance/contracts";

import {
  goalLeft,
  goalPct,
  goalStatus,
  groupGoals,
  isGoalCloseable,
  monthsUntil,
  neededPerMonth,
} from "./savingsMetrics";

const NOW = new Date("2026-09-06T00:00:00Z");

function makeGoal(overrides: Partial<savings.SavingsGoal> = {}): savings.SavingsGoal {
  return {
    id: "g1",
    title: "Meta",
    targetAmount: "1000000.0000",
    currency: "CLP",
    deadline: null,
    notes: null,
    color: null,
    closedAt: null,
    closeDestination: null,
    closeAccountId: null,
    closeTargetGoalId: null,
    savedAmount: "0.0000",
    pace: "0.0000",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("goalPct / goalLeft", () => {
  it("caps the percentage at 100 even when over-funded", () => {
    expect(goalPct("1500000", "1000000")).toBe(100);
  });

  it("left is never negative", () => {
    expect(goalLeft("1500000", "1000000")).toBe("0");
  });

  it("computes the plain percentage otherwise", () => {
    expect(goalPct("250000", "1000000")).toBe(25);
  });
});

describe("goalStatus", () => {
  it("cumplida: saved >= target, regardless of deadline", () => {
    const goal = makeGoal({ savedAmount: "1000000.0000", deadline: "2020-01-01T00:00:00.000Z" });
    expect(goalStatus(goal, NOW).kind).toBe("complete");
  });

  it("vencida: incomplete with a deadline already past", () => {
    const goal = makeGoal({ savedAmount: "100000.0000", deadline: "2026-08-01T00:00:00.000Z" });
    expect(goalStatus(goal, NOW).kind).toBe("overdue");
  });

  it("sin aportes: incomplete, not overdue, pace is 0", () => {
    const goal = makeGoal({ savedAmount: "0.0000", pace: "0.0000" });
    expect(goalStatus(goal, NOW).kind).toBe("noContributions");
  });

  it("no llega a tiempo: eta further out than the deadline", () => {
    const goal = makeGoal({
      savedAmount: "100000.0000",
      pace: "50000.0000",
      deadline: "2026-10-01T00:00:00.000Z", // ~1 month away, needs 18 at this pace
    });
    const status = goalStatus(goal, NOW);
    expect(status.kind).toBe("shortOnPace");
  });

  it("en ritmo: eta at or before the deadline, or no deadline at all", () => {
    const withDeadline = makeGoal({
      savedAmount: "900000.0000",
      pace: "200000.0000",
      deadline: "2027-01-01T00:00:00.000Z",
    });
    expect(goalStatus(withDeadline, NOW).kind).toBe("onTrack");

    const noDeadline = makeGoal({
      savedAmount: "500000.0000",
      pace: "100000.0000",
      deadline: null,
    });
    expect(goalStatus(noDeadline, NOW).kind).toBe("onTrack");
  });
});

describe("groupGoals", () => {
  it("groups into live/late/done and excludes closed goals entirely", () => {
    const goals: savings.SavingsGoal[] = [
      makeGoal({ id: "live", savedAmount: "100000.0000", pace: "50000.0000" }),
      makeGoal({ id: "late", savedAmount: "100000.0000", deadline: "2026-01-01T00:00:00.000Z" }),
      makeGoal({ id: "done", savedAmount: "1000000.0000" }),
      makeGoal({ id: "closed", closedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const groups = groupGoals(goals, NOW);
    expect(groups.live.map((g) => g.goal.id)).toEqual(["live"]);
    expect(groups.late.map((g) => g.goal.id)).toEqual(["late"]);
    expect(groups.done.map((g) => g.goal.id)).toEqual(["done"]);
  });
});

describe("isGoalCloseable", () => {
  it("only cumplida or vencida goals are closeable", () => {
    expect(isGoalCloseable({ kind: "complete" })).toBe(true);
    expect(isGoalCloseable({ kind: "overdue", missing: "1" })).toBe(true);
    expect(
      isGoalCloseable({ kind: "onTrack", etaLabel: "x", etaMonths: 1, deadlineMonths: null }),
    ).toBe(false);
    expect(isGoalCloseable({ kind: "noContributions" })).toBe(false);
  });
});

describe("monthsUntil / neededPerMonth", () => {
  it("rounds down to whole months not yet reached", () => {
    expect(monthsUntil(new Date("2026-09-06T00:00:00Z"), new Date("2026-12-01T00:00:00Z"))).toBe(2);
    expect(monthsUntil(new Date("2026-09-06T00:00:00Z"), new Date("2026-12-10T00:00:00Z"))).toBe(3);
  });

  it("rounds the needed monthly aporte up to the nearest 10.000", () => {
    expect(neededPerMonth("0", "1000000", 7)).toBe("150000");
    expect(neededPerMonth("0", "1000000", 0)).toBe("0");
  });
});
