import { describe, expect, it } from "vitest";

import { InstallmentPlan } from "../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import { InstallmentPaymentNotFoundError } from "../../../../../src/domains/installment-plan/domain/errors";

describe("InstallmentPlan.planCreation", () => {
  it("generates an equal-principal schedule with monthly due dates", () => {
    const planned = InstallmentPlan.planCreation({
      title: "Laptop",
      totalPrincipal: "1200",
      installmentCount: 3,
      startDate: new Date("2026-01-15T00:00:00.000Z"),
      currency: "USD",
      frequency: "MONTHLY",
      frequencyInterval: 1,
    });

    expect(planned.payments).toHaveLength(3);
    expect(planned.payments.map((p) => p.amount)).toEqual(["400.0000", "400.0000", "400.0000"]);
    expect(planned.payments[0]!.dueDate.toISOString().startsWith("2026-01")).toBe(true);
    expect(planned.payments[1]!.dueDate.toISOString().startsWith("2026-02")).toBe(true);
    expect(planned.payments[2]!.dueDate.toISOString().startsWith("2026-03")).toBe(true);
  });

  it("steps due dates weekly x interval", () => {
    const planned = InstallmentPlan.planCreation({
      title: "Weekly plan",
      totalPrincipal: "300",
      installmentCount: 3,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      currency: "USD",
      frequency: "WEEKLY",
      frequencyInterval: 2,
    });
    expect(planned.payments[1]!.dueDate.toISOString().startsWith("2026-01-15")).toBe(true);
  });
});

function makePlan() {
  return InstallmentPlan.fromPersistence({
    id: "p1",
    userId: "u1",
    title: "Laptop",
    totalPrincipal: "1200",
    installmentCount: 3,
    startDate: new Date("2026-01-15T00:00:00.000Z"),
    currency: "USD",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: null,
    notes: null,
    payments: [
      { id: "pay1", sequence: 1, dueDate: new Date("2026-01-15"), amount: "400", paidAt: null },
      { id: "pay2", sequence: 2, dueDate: new Date("2026-02-15"), amount: "400", paidAt: null },
      { id: "pay3", sequence: 3, dueDate: new Date("2026-03-15"), amount: "400", paidAt: null },
    ],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  });
}

describe("InstallmentPlan.markPaymentPaid / markPaymentUnpaid", () => {
  it("marks a scheduled payment paid", () => {
    const plan = makePlan();
    plan.markPaymentPaid(2);
    expect(plan.payments.find((p) => p.sequence === 2)?.paidAt).not.toBeNull();
    expect(plan.payments.find((p) => p.sequence === 1)?.paidAt).toBeNull();
  });

  it("clears a payment's paid status", () => {
    const plan = makePlan();
    plan.markPaymentPaid(2);
    plan.markPaymentUnpaid(2);
    expect(plan.payments.find((p) => p.sequence === 2)?.paidAt).toBeNull();
  });

  it("throws InstallmentPaymentNotFoundError for an unknown sequence", () => {
    const plan = makePlan();
    expect(() => plan.markPaymentPaid(99)).toThrow(InstallmentPaymentNotFoundError);
    expect(() => plan.markPaymentUnpaid(99)).toThrow(InstallmentPaymentNotFoundError);
  });

  it("is idempotent — marking an already-paid payment paid again does not throw", () => {
    const plan = makePlan();
    plan.markPaymentPaid(1);
    expect(() => plan.markPaymentPaid(1)).not.toThrow();
  });
});

describe("InstallmentPlan.applyUpdate", () => {
  it("updates scalar fields and leaves the schedule untouched", () => {
    const plan = makePlan();
    plan.applyUpdate({ title: "New title", notes: "note" });
    expect(plan.title).toBe("New title");
    expect(plan.notes).toBe("note");
    expect(plan.payments).toHaveLength(3);
  });
});
