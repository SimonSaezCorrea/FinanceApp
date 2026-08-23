import { describe, expect, it } from "vitest";

import {
  InstallmentPlan,
  type InstallmentPaymentProps,
  type InstallmentPlanProps,
} from "../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import {
  InstallmentPaymentNotFoundError,
  InstallmentPlanBilledError,
  InstallmentPlanSettledError,
} from "../../../../../src/domains/installment-plan/domain/errors";

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

function payment(over: Partial<InstallmentPaymentProps> = {}): InstallmentPaymentProps {
  return {
    id: `pay${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: new Date("2026-01-15"),
    amount: "400",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    transactionId: null,
    creditStatementId: null,
    ...over,
  };
}

function makePlan(over: Partial<InstallmentPlanProps> = {}) {
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
    category: null,
    paymentAccountId: null,
    notes: null,
    payments: [
      payment({ sequence: 1, dueDate: new Date("2026-01-15") }),
      payment({ sequence: 2, dueDate: new Date("2026-02-15") }),
      payment({ sequence: 3, dueDate: new Date("2026-03-15") }),
    ],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
    ...over,
  });
}

/** A plan whose first instalment a period has already charged (spec 014). */
function billedPlan(paymentOverrides: Partial<InstallmentPaymentProps> = {}) {
  return makePlan({
    payments: [
      payment({ sequence: 1, dueDate: new Date("2026-01-15"), creditStatementId: "st_1", ...paymentOverrides }),
      payment({ sequence: 2, dueDate: new Date("2026-02-15") }),
      payment({ sequence: 3, dueDate: new Date("2026-03-15") }),
    ],
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

  // --- spec 014, FR-006b: commitment-defining fields freeze once billed ---

  it("still allows changing the card while no instalment has been billed", () => {
    const plan = makePlan();
    expect(() => plan.applyUpdate({ cardId: "cCredit" })).not.toThrow();
    expect(plan.snapshot().cardId).toBe("cCredit");
  });

  it("refuses to change the card once an instalment has been billed", () => {
    const plan = billedPlan();
    expect(() => plan.applyUpdate({ cardId: "cOther" })).toThrow(InstallmentPlanBilledError);
    // Nothing partially applied: the card stays what it was.
    expect(plan.snapshot().cardId).toBeNull();
  });

  it("still allows editing descriptive fields once billed — only the commitment freezes", () => {
    const plan = billedPlan();
    expect(() =>
      plan.applyUpdate({ title: "Renamed", category: "Otro", notes: "updated" }),
    ).not.toThrow();
    expect(plan.title).toBe("Renamed");
  });

  it("does not refuse re-setting the card to the SAME value once billed", () => {
    const plan = billedPlan(); // cardId starts null on both sides
    expect(() => plan.applyUpdate({ cardId: null })).not.toThrow();
  });
});

describe("InstallmentPlan billing invariants (spec 014)", () => {
  // FR-006a: deleting is refused only once an instalment sits on a SETTLED period —
  // narrower than the edit freeze above, because unwinding a merely PENDING period
  // touches no real payment.
  it("assertDeletable does not throw while every billed instalment is still unsettled", () => {
    const plan = billedPlan(); // billed, not yet paid
    expect(() => plan.assertDeletable()).not.toThrow();
  });

  it("assertDeletable throws once a billed instalment's period is settled", () => {
    const plan = billedPlan();
    plan.markPaymentPaid(1); // the period that charged it was paid
    expect(() => plan.assertDeletable()).toThrow(InstallmentPlanSettledError);
  });

  it("assertDeletable does not throw for a plan with no billed instalments at all", () => {
    const plan = makePlan();
    expect(() => plan.assertDeletable()).not.toThrow();
  });
});
