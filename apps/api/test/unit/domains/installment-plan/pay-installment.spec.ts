import { describe, expect, it } from "vitest";

import {
  InstallmentPaymentAlreadyPaidError,
  InvalidPaymentAmountError,
  PaymentExceedsRemainingError,
} from "../../../../src/domains/installment-plan/domain/errors";
import {
  InstallmentPlan,
  type InstallmentPaymentProps,
} from "../../../../src/domains/installment-plan/domain/installment-plan.aggregate";

/**
 * The aggregate's pay/unpay rules, with no database in sight.
 *
 * These are the invariants that keep the books square: a payment never rewrites the
 * schedule, whatever it fails to cover lands on the next unpaid instalment, and
 * undoing reverses exactly what that payment caused — no more.
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
    creditStatementId: null,
    ...over,
  };
}

function plan(payments: InstallmentPaymentProps[]): InstallmentPlan {
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
    cardId: null,
    category: null,
    paymentAccountId: null,
    notes: null,
    payments,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function threeUnpaid(): InstallmentPlan {
  return plan([payment({ sequence: 1 }), payment({ sequence: 2 }), payment({ sequence: 3 })]);
}

describe("payInstallment — exact amount", () => {
  it("settles the instalment and moves nothing else", () => {
    const p = threeUnpaid();
    const result = p.payInstallment(1, "10000", NOW, "tx1");

    expect(result.carryDeltas).toEqual([]);
    const first = p.payments.find((x) => x.sequence === 1);
    expect(first?.paidAt).toEqual(NOW);
    expect(first?.paidAmount).toBe("10000.0000");
    expect(first?.transactionId).toBe("tx1");
  });

  it("defaults to what the instalment owes when no amount is given", () => {
    const p = plan([
      payment({ sequence: 1, carriedOverAmount: "3000.0000" }),
      payment({ sequence: 2 }),
    ]);
    p.payInstallment(1, null, NOW, null);

    expect(p.payments.find((x) => x.sequence === 1)?.paidAmount).toBe("13000.0000");
  });
});

describe("payInstallment — short", () => {
  it("carries the shortfall onto the next unpaid instalment", () => {
    const p = threeUnpaid();
    const result = p.payInstallment(1, "7000", NOW, null);

    expect(result.carryDeltas).toEqual([{ sequence: 2, delta: "3000.0000" }]);
    expect(p.payments.find((x) => x.sequence === 2)?.carriedOverAmount).toBe("3000.0000");
  });

  it("leaves every scheduled amount untouched (FR-020)", () => {
    const p = threeUnpaid();
    p.payInstallment(1, "7000", NOW, null);

    expect(p.payments.map((x) => x.amount)).toEqual(["10000.0000", "10000.0000", "10000.0000"]);
  });

  it("does NOT settle the LAST unpaid instalment when short (FR-023)", () => {
    const p = plan([
      payment({ sequence: 1, paidAt: NOW, paidAmount: "10000.0000" }),
      payment({ sequence: 2 }),
    ]);
    p.payInstallment(2, "6000", NOW, null);

    const last = p.payments.find((x) => x.sequence === 2);
    // Still payable for the remaining 4000 — settling it here would forgive the debt.
    expect(last?.paidAt).toBeNull();
    expect(last?.paidAmount).toBe("6000.0000");
    expect(p.toContract({ now: NOW }).status).toBe("PARTIALLY_PAID");
  });
});

describe("payInstallment — over", () => {
  it("reduces the next unpaid instalment", () => {
    const p = threeUnpaid();
    const result = p.payInstallment(1, "13000", NOW, null);

    expect(result.carryDeltas).toEqual([{ sequence: 2, delta: "-3000.0000" }]);
  });

  it("flows through several instalments when it exceeds one (FR-021a)", () => {
    const p = threeUnpaid();
    p.payInstallment(1, "25000", NOW, null);

    expect(p.payments.find((x) => x.sequence === 2)?.carriedOverAmount).toBe("-10000.0000");
    expect(p.payments.find((x) => x.sequence === 3)?.carriedOverAmount).toBe("-5000.0000");
  });

  it("refuses a payment larger than the whole plan still owes (FR-021b)", () => {
    const p = threeUnpaid();
    // The surplus would have no debt to apply to, and this domain has no notion of
    // credit in the user's favour.
    expect(() => p.payInstallment(1, "40000", NOW, null)).toThrow(PaymentExceedsRemainingError);
  });
});

describe("payInstallment — refusals", () => {
  it("refuses an instalment that is already paid (INV-C3)", () => {
    const p = plan([payment({ sequence: 1, paidAt: NOW, paidAmount: "10000.0000" })]);
    // This is what stops a double-click recording two expenses for one instalment.
    expect(() => p.payInstallment(1, "10000", NOW, null)).toThrow(
      InstallmentPaymentAlreadyPaidError,
    );
  });

  it("refuses zero or a negative amount (INV-C2)", () => {
    const p = threeUnpaid();
    expect(() => p.payInstallment(1, "0", NOW, null)).toThrow(InvalidPaymentAmountError);
    expect(() => p.payInstallment(1, "-5000", NOW, null)).toThrow(InvalidPaymentAmountError);
  });
});

describe("unpayInstallment", () => {
  it("clears the instalment and hands back the expense to delete", () => {
    const p = threeUnpaid();
    p.payInstallment(1, "10000", NOW, "tx1");
    const result = p.unpayInstallment(1);

    expect(result.transactionId).toBe("tx1");
    expect(result.refundAmount).toBe("10000.0000");
    const first = p.payments.find((x) => x.sequence === 1);
    expect(first?.paidAt).toBeNull();
    expect(first?.paidAmount).toBeNull();
    expect(first?.transactionId).toBeNull();
  });

  it("reverses the carry that payment produced", () => {
    const p = threeUnpaid();
    p.payInstallment(1, "7000", NOW, null);
    const result = p.unpayInstallment(1);

    expect(result.carryDeltas).toEqual([{ sequence: 2, delta: "-3000.0000" }]);
    expect(p.payments.find((x) => x.sequence === 2)?.carriedOverAmount).toBe("0.0000");
  });

  it("does NOT touch what the undone instalment itself inherited", () => {
    // 1 paid short → 2 carries 3000. Undoing 2's own payment must leave that alone:
    // it belongs to payment 1, which still stands.
    const p = threeUnpaid();
    p.payInstallment(1, "7000", NOW, null);
    p.payInstallment(2, "13000", NOW, null);
    p.unpayInstallment(2);

    expect(p.payments.find((x) => x.sequence === 2)?.carriedOverAmount).toBe("3000.0000");
  });

  it("reports a legacy row's refund as zero, since no money is known to move", () => {
    const p = plan([payment({ sequence: 1, paidAt: NOW, paidAmount: null })]);
    const result = p.unpayInstallment(1);

    expect(result.refundAmount).toBe("0.0000");
    expect(result.transactionId).toBeNull();
  });
});
