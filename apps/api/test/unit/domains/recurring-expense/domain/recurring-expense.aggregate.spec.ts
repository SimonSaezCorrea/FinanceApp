import { describe, expect, it } from "vitest";

import {
  RecurringExpense,
  nextDue,
  startOfTodayUTC,
} from "../../../../../src/domains/recurring-expense/domain/recurring-expense.aggregate";

function makeExpense(
  overrides: Partial<Parameters<typeof RecurringExpense.fromPersistence>[0]> = {},
) {
  return RecurringExpense.fromPersistence({
    id: "r1",
    userId: "u1",
    label: "Arriendo",
    amount: "520000",
    currency: "CLP",
    category: "Vivienda",
    frequency: "MONTHLY",
    interval: 1,
    anchorDate: new Date("2026-01-05T00:00:00Z"),
    bankAccountId: null,
    active: true,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  });
}

describe("nextDue", () => {
  it("returns the anchor when it is still in the future", () => {
    const d = nextDue(
      new Date("2026-07-01T00:00:00Z"),
      "MONTHLY",
      1,
      new Date("2026-06-21T00:00:00Z"),
    );
    expect(d.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("steps a monthly anchor forward to the next occurrence on/after today", () => {
    const d = nextDue(
      new Date("2026-01-05T00:00:00Z"),
      "MONTHLY",
      1,
      new Date("2026-06-21T00:00:00Z"),
    );
    expect(d.toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  it("handles weekly intervals", () => {
    const d = nextDue(
      new Date("2026-06-01T00:00:00Z"),
      "WEEKLY",
      2,
      new Date("2026-06-21T00:00:00Z"),
    );
    // +2w = Jun 15 (< 21), +2w = Jun 29
    expect(d.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  it("handles yearly", () => {
    const d = nextDue(
      new Date("2024-03-10T00:00:00Z"),
      "YEARLY",
      1,
      new Date("2026-06-21T00:00:00Z"),
    );
    expect(d.toISOString()).toBe("2027-03-10T00:00:00.000Z");
  });
});

describe("startOfTodayUTC", () => {
  it("truncates to midnight UTC", () => {
    expect(startOfTodayUTC(new Date("2026-06-21T15:42:07Z")).toISOString()).toBe(
      "2026-06-21T00:00:00.000Z",
    );
  });
});

describe("RecurringExpense.planCreation", () => {
  it("defaults category/bankAccountId/notes to null and active to true", () => {
    const planned = RecurringExpense.planCreation({
      label: "Arriendo",
      amount: "520000",
      currency: "CLP",
      frequency: "MONTHLY",
      interval: 1,
      anchorDate: new Date("2026-01-05T00:00:00Z"),
    });
    expect(planned.category).toBeNull();
    expect(planned.bankAccountId).toBeNull();
    expect(planned.notes).toBeNull();
    expect(planned.active).toBe(true);
  });

  it("honors an explicit active: false", () => {
    const planned = RecurringExpense.planCreation({
      label: "Arriendo",
      amount: "520000",
      currency: "CLP",
      frequency: "MONTHLY",
      interval: 1,
      anchorDate: new Date("2026-01-05T00:00:00Z"),
      active: false,
    });
    expect(planned.active).toBe(false);
  });
});

describe("RecurringExpense.toContract", () => {
  it("maps money as a fixed decimal string, dates as ISO, and computes nextDueAt", () => {
    const expense = makeExpense();
    const contract = expense.toContract(new Date("2026-06-21T00:00:00Z"));
    expect(contract).toMatchObject({
      id: "r1",
      label: "Arriendo",
      amount: "520000.0000",
      currency: "CLP",
      category: "Vivienda",
      frequency: "MONTHLY",
      interval: 1,
      anchorDate: "2026-01-05T00:00:00.000Z",
      bankAccountId: null,
      active: true,
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(contract.nextDueAt).toBe("2026-07-05T00:00:00.000Z");
  });
});

describe("RecurringExpense.applyUpdate", () => {
  it("patches only the provided scalar fields", () => {
    const expense = makeExpense();
    expense.applyUpdate({ label: "Arriendo depto", active: false });
    const contract = expense.toContract(new Date("2026-06-21T00:00:00Z"));
    expect(contract.label).toBe("Arriendo depto");
    expect(contract.active).toBe(false);
    expect(contract.amount).toBe("520000.0000");
  });

  it("allows clearing category/notes/bankAccountId back to null", () => {
    const expense = makeExpense({ category: "Vivienda", notes: "x", bankAccountId: "acc1" });
    expense.applyUpdate({ category: null, notes: null, bankAccountId: null });
    const contract = expense.toContract(new Date("2026-06-21T00:00:00Z"));
    expect(contract.category).toBeNull();
    expect(contract.notes).toBeNull();
    expect(contract.bankAccountId).toBeNull();
  });
});
