import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SavingsService } from "./savings.service";
import type { SavingsRepository } from "./savings.repository";

const goalRow = {
  id: "g1",
  userId: "u1",
  title: "Emergency fund",
  targetAmount: { toString: () => "5000" },
  currency: "USD",
  deadline: new Date("2026-12-31T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const entryRow = {
  id: "e1",
  userId: "u1",
  savingsGoalId: "g1",
  amount: { toString: () => "250" },
  currency: "USD",
  contributedAt: new Date("2026-02-01T00:00:00Z"),
  note: null,
  createdAt: new Date("2026-02-01T00:00:00Z"),
};

function makeService(repo: Partial<SavingsRepository>) {
  return new SavingsService(repo as SavingsRepository);
}

describe("SavingsService", () => {
  it("maps and defaults currency on createGoal (money fixed string, dates ISO)", async () => {
    const createGoal = vi.fn().mockResolvedValue(goalRow);
    const svc = makeService({ createGoal });
    const goal = await svc.createGoal("u1", {
      title: "Emergency fund",
      targetAmount: "5000",
      currency: "USD",
      deadline: "2026-12-31T00:00:00.000Z",
    });
    expect(createGoal.mock.calls[0]![1]).toMatchObject({
      title: "Emergency fund",
      targetAmount: "5000",
      currency: "USD",
    });
    expect(createGoal.mock.calls[0]![1].deadline).toBeInstanceOf(Date);
    expect(goal).toEqual({
      id: "g1",
      title: "Emergency fund",
      targetAmount: "5000.0000",
      currency: "USD",
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("throws NotFound when getting a missing goal", async () => {
    const svc = makeService({ findGoal: vi.fn().mockResolvedValue(null) });
    await expect(svc.getGoal("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("converts contributedAt to a Date on createEntry", async () => {
    const createEntry = vi.fn().mockResolvedValue(entryRow);
    const svc = makeService({ createEntry });
    await svc.createEntry("u1", {
      amount: "250",
      currency: "USD",
      contributedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(createEntry.mock.calls[0]![1].contributedAt).toBeInstanceOf(Date);
  });
});
