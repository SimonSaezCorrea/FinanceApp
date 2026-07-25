import { describe, expect, it } from "vitest";

import { SavingsEntry } from "../../../../../src/domains/savings/domain/savings-entry.aggregate";

describe("SavingsEntry.planCreation", () => {
  it("defaults savingsGoalId and note to null when not provided", () => {
    const planned = SavingsEntry.planCreation({
      amount: "250",
      currency: "USD",
      contributedAt: new Date("2026-02-01T00:00:00Z"),
    });
    expect(planned.savingsGoalId).toBeNull();
    expect(planned.note).toBeNull();
  });

  it("keeps an explicit savingsGoalId and note", () => {
    const planned = SavingsEntry.planCreation({
      savingsGoalId: "g1",
      amount: "250",
      currency: "USD",
      contributedAt: new Date("2026-02-01T00:00:00Z"),
      note: "Bonus deposit",
    });
    expect(planned.savingsGoalId).toBe("g1");
    expect(planned.note).toBe("Bonus deposit");
  });
});

describe("SavingsEntry.toContract", () => {
  it("maps money as a fixed decimal string and dates as ISO", () => {
    const entry = SavingsEntry.fromPersistence({
      id: "e1",
      userId: "u1",
      savingsGoalId: "g1",
      amount: "250",
      currency: "USD",
      contributedAt: new Date("2026-02-01T00:00:00Z"),
      note: null,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    expect(entry.toContract()).toEqual({
      id: "e1",
      savingsGoalId: "g1",
      amount: "250.0000",
      currency: "USD",
      contributedAt: "2026-02-01T00:00:00.000Z",
      note: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
  });
});
