import { describe, expect, it } from "vitest";

import {
  InstallmentPlan,
  type InstallmentPaymentProps,
} from "../../../../src/domains/installment-plan/domain/installment-plan.aggregate";

/**
 * The figures the list and the panel read: what has been paid, what is still owed,
 * when the next instalment falls due and what state that puts the plan in.
 *
 * They are DERIVED on every read, never stored, so this suite is the only place that
 * pins them down. The case that keeps coming back is the legacy row — an instalment
 * marked paid before this feature existed, which has a date and no amount (R10).
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");

function payment(over: Partial<InstallmentPaymentProps> = {}): InstallmentPaymentProps {
  return {
    id: `p${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: new Date("2026-09-05T00:00:00.000Z"),
    amount: "10000.0000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    transactionId: null,
    ...over,
  };
}

function plan(payments: InstallmentPaymentProps[], cardKind: "CREDIT" | "DEBIT" | null = null) {
  return InstallmentPlan.fromPersistence({
    id: "pl1",
    userId: "u1",
    title: "Notebook",
    totalPrincipal: "30000.0000",
    installmentCount: payments.length,
    startDate: new Date("2026-07-05T00:00:00.000Z"),
    currency: "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: cardKind ? "c1" : null,
    category: "Tecnología",
    paymentAccountId: null,
    notes: null,
    payments,
    createdAt: NOW,
    updatedAt: NOW,
  }).toContract({ now: NOW, cardKind });
}

describe("paidTotal", () => {
  it("adds up what was actually paid", () => {
    const dto = plan([
      payment({ sequence: 1, paidAt: NOW, paidAmount: "7000.0000" }),
      payment({ sequence: 2, carriedOverAmount: "3000.0000" }),
    ]);
    expect(dto.paidTotal).toBe("7000.0000");
  });

  it("falls back to the scheduled amount on a legacy row paid with no amount", () => {
    // Not zero: the instalment WAS paid, we just don't know for how much, and the
    // only honest figure available is what it was scheduled for.
    const dto = plan([payment({ sequence: 1, paidAt: NOW, paidAmount: null })]);
    expect(dto.paidTotal).toBe("10000.0000");
  });

  it("is zero when nothing is paid", () => {
    expect(plan([payment({ sequence: 1 })]).paidTotal).toBe("0.0000");
  });
});

describe("remainingAmount", () => {
  it("sums what the unpaid instalments owe, carry-overs included", () => {
    const dto = plan([
      payment({ sequence: 1, paidAt: NOW, paidAmount: "7000.0000" }),
      payment({ sequence: 2, carriedOverAmount: "3000.0000" }),
      payment({ sequence: 3 }),
    ]);
    // 13000 owed on #2 + 10000 on #3.
    expect(dto.remainingAmount).toBe("23000.0000");
  });

  it("counts only the unsettled part of a partially credited instalment", () => {
    const dto = plan([payment({ sequence: 1, paidAmount: "6000.0000" })]);
    expect(dto.remainingAmount).toBe("4000.0000");
  });

  it("is zero on a fully paid plan", () => {
    const dto = plan([payment({ sequence: 1, paidAt: NOW, paidAmount: "10000.0000" })]);
    expect(dto.remainingAmount).toBe("0.0000");
  });
});

describe("nextDueDate and status", () => {
  it("points at the OLDEST unpaid instalment, not the next by creation order", () => {
    const dto = plan([
      payment({ sequence: 1, dueDate: new Date("2026-08-05T00:00:00.000Z") }),
      payment({ sequence: 2, dueDate: new Date("2026-09-05T00:00:00.000Z") }),
    ]);
    expect(dto.nextDueDate).toBe("2026-08-05T00:00:00.000Z");
    expect(dto.status).toBe("OVERDUE");
  });

  it("skips an instalment paid out of order", () => {
    const dto = plan([
      payment({
        sequence: 1,
        dueDate: new Date("2026-08-05T00:00:00.000Z"),
        paidAt: NOW,
        paidAmount: "10000.0000",
      }),
      payment({ sequence: 2, dueDate: new Date("2026-09-05T00:00:00.000Z") }),
    ]);
    expect(dto.nextDueDate).toBe("2026-09-05T00:00:00.000Z");
    expect(dto.status).toBe("ON_TRACK");
  });

  it("is DUE_SOON within a week", () => {
    const dto = plan([payment({ sequence: 1, dueDate: new Date("2026-08-18T00:00:00.000Z") })]);
    expect(dto.status).toBe("DUE_SOON");
  });

  it("is PAID with nothing left and no shortfall", () => {
    const dto = plan([payment({ sequence: 1, paidAt: NOW, paidAmount: "10000.0000" })]);
    expect(dto.nextDueDate).toBeNull();
    expect(dto.status).toBe("PAID");
  });

  it("is PARTIALLY_PAID when the only one left carries partial credit (FR-023)", () => {
    const dto = plan([
      payment({ sequence: 1, paidAt: NOW, paidAmount: "10000.0000" }),
      payment({ sequence: 2, paidAmount: "6000.0000" }),
    ]);
    expect(dto.status).toBe("PARTIALLY_PAID");
  });
});

describe("dueAmount per instalment", () => {
  it("exposes scheduled + carried so the UI can show them apart (FR-022)", () => {
    const dto = plan([payment({ sequence: 1, carriedOverAmount: "3000.0000" })]);
    expect(dto.payments[0].amount).toBe("10000.0000");
    expect(dto.payments[0].carriedOverAmount).toBe("3000.0000");
    expect(dto.payments[0].dueAmount).toBe("13000.0000");
  });
});

describe("generatesMovementOnPay", () => {
  it("is false for a CREDIT-card plan and true otherwise", () => {
    expect(plan([payment()], "CREDIT").generatesMovementOnPay).toBe(false);
    expect(plan([payment()], "DEBIT").generatesMovementOnPay).toBe(true);
    expect(plan([payment()], null).generatesMovementOnPay).toBe(true);
  });
});
