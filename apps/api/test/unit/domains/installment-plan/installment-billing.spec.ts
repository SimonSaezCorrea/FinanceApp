import { describe, expect, it } from "vitest";

import {
  selectBillableInstallments,
  type BillableCandidate,
} from "../../../../src/domains/installment-plan/domain/installment-billing";

/**
 * Spec 014 — which instalments a closing period charges (FR-008, FR-009, FR-009a,
 * FR-013, FR-013a, FR-013b).
 *
 * Kept pure and I/O-free on purpose: "exactly once, ever" is the invariant this whole
 * feature stands on (SC-003), and it must be provable without a database. The account
 * scoping (only plans whose card belongs to THIS account) is the repository query's
 * job — it is a join, not a rule; what lives here is everything that is a rule.
 */

const CLOSED_AT = new Date("2026-04-05T00:00:00.000Z");

function candidate(over: Partial<BillableCandidate> = {}): BillableCandidate {
  return {
    planId: "plan1",
    paymentId: "pay1",
    sequence: 1,
    dueDate: new Date("2026-04-01T00:00:00.000Z"),
    amount: "90000",
    currency: "CLP",
    creditStatementId: null,
    ...over,
  };
}

function select(candidates: BillableCandidate[], accountCurrency = "CLP") {
  return selectBillableInstallments({ candidates, closedAt: CLOSED_AT, accountCurrency });
}

describe("selectBillableInstallments", () => {
  it("charges an instalment that fell due within the period", () => {
    const result = select([candidate()]);
    expect(result.paymentIds).toEqual(["pay1"]);
    expect(result.total).toBe("90000.0000");
    expect(result.count).toBe(1);
  });

  it("leaves an instalment that is not due yet", () => {
    const result = select([candidate({ dueDate: new Date("2026-05-01T00:00:00.000Z") })]);
    expect(result.paymentIds).toEqual([]);
    expect(result.total).toBe("0.0000");
  });

  // FR-009 / FR-013a: this is what makes "billed exactly once" true by construction.
  // A retry, a second manual "Generar facturación", or the cron running after the
  // button must all be no-ops on an instalment that already carries a period.
  it("never charges an instalment a period already took", () => {
    const result = select([candidate({ creditStatementId: "stPrevious" })]);
    expect(result.paymentIds).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("is idempotent: feeding back what it just selected selects nothing", () => {
    const first = select([candidate()]);
    const afterStamping = candidate({ creditStatementId: "stNow" });
    expect(first.paymentIds).toHaveLength(1);
    expect(select([afterStamping]).paymentIds).toEqual([]);
  });

  // FR-013b: the boundary case, decided rather than left to chance. An instalment
  // due exactly at the closing instant HAS fallen due; pushing it out would delay it
  // a whole period for a difference of zero.
  it("includes an instalment due at the exact closing instant", () => {
    const result = select([candidate({ dueDate: CLOSED_AT })]);
    expect(result.paymentIds).toEqual(["pay1"]);
  });

  // FR-009: the gap case, in its pure form. Two instalments fell due while no period
  // was generated (a cycle with no card activity produces none). Both are charged
  // now — neither is lost, neither is charged twice.
  it("charges everything still unbilled, however far back it fell due", () => {
    const result = select([
      candidate({ paymentId: "payFeb", sequence: 1, dueDate: new Date("2026-02-01") }),
      candidate({ paymentId: "payMar", sequence: 2, dueDate: new Date("2026-03-01") }),
      candidate({ paymentId: "payApr", sequence: 3, dueDate: new Date("2026-04-01") }),
    ]);
    expect(result.paymentIds).toEqual(["payFeb", "payMar", "payApr"]);
    expect(result.total).toBe("270000.0000");
    expect(result.count).toBe(3);
  });

  // FR-009a: no FX anywhere in this app. Billing a USD instalment onto a CLP statement
  // would mean inventing a rate, so it is left unbilled and the plan says why.
  it("skips an instalment whose plan is in another currency, and reports it", () => {
    const result = select([
      candidate({ paymentId: "payClp" }),
      candidate({ planId: "planUsd", paymentId: "payUsd", currency: "USD" }),
    ]);
    expect(result.paymentIds).toEqual(["payClp"]);
    expect(result.total).toBe("90000.0000");
    expect(result.skippedForCurrency).toEqual(["planUsd"]);
  });

  it("reports each mismatched plan once, however many instalments it has due", () => {
    const result = select([
      candidate({ planId: "planUsd", paymentId: "p1", sequence: 1, currency: "USD" }),
      candidate({ planId: "planUsd", paymentId: "p2", sequence: 2, currency: "USD" }),
    ]);
    expect(result.skippedForCurrency).toEqual(["planUsd"]);
  });

  // FR-013: after the last instalment, the plan simply has nothing left to offer.
  // No counter, no flag, no "is this plan finished?" check — it falls out of the rule.
  it("selects nothing when every instalment is already billed", () => {
    const result = select([
      candidate({ paymentId: "p1", sequence: 1, creditStatementId: "st1" }),
      candidate({ paymentId: "p2", sequence: 2, creditStatementId: "st2" }),
    ]);
    expect(result).toEqual({
      paymentIds: [],
      total: "0.0000",
      count: 0,
      skippedForCurrency: [],
    });
  });

  it("sums several plans of the same card into one period", () => {
    const result = select([
      candidate({ planId: "planA", paymentId: "pA", amount: "90000" }),
      candidate({ planId: "planB", paymentId: "pB", amount: "35500" }),
    ]);
    expect(result.total).toBe("125500.0000");
    expect(result.count).toBe(2);
  });

  it("selects nothing from an empty schedule", () => {
    expect(select([])).toEqual({
      paymentIds: [],
      total: "0.0000",
      count: 0,
      skippedForCurrency: [],
    });
  });
});
