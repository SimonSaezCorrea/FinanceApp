import type { installments } from "@finance/contracts";
import { describe, expect, it } from "vitest";

import { nextDuePayment, paymentStatus, planKpis, visiblePlans } from "./installmentMetrics";

/**
 * The four figures in the header and the filters underneath them.
 *
 * Derived in the client over the whole list (there is no pagination here, so unlike
 * Movements there is nothing to be wrong about). What this suite pins down is the two
 * questions the mockup left open: WHICH instalments count as "this month", and what
 * "pending" adds up when carry-overs are in play.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");

function payment(
  over: Partial<installments.InstallmentPayment> = {},
): installments.InstallmentPayment {
  return {
    id: `p${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: "2026-08-20T00:00:00.000Z",
    amount: "10000.0000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    dueAmount: "10000.0000",
    transactionId: null,
    ...over,
  };
}

function plan(over: Partial<installments.InstallmentPlan> = {}): installments.InstallmentPlan {
  return {
    id: "pl1",
    title: "Notebook",
    totalPrincipal: "30000.0000",
    installmentCount: 3,
    startDate: "2026-07-05T00:00:00.000Z",
    currency: "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: null,
    category: null,
    paymentAccountId: null,
    notes: null,
    payments: [payment()],
    paidTotal: "0.0000",
    remainingAmount: "10000.0000",
    nextDueDate: "2026-08-20T00:00:00.000Z",
    status: "DUE_SOON",
    generatesMovementOnPay: true,
    deletionImpact: null,
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...over,
  };
}

describe("planKpis — this month", () => {
  it("counts instalments due in the CURRENT calendar month, paid or not (FR-004a)", () => {
    // What the month COMMITS, not what is still owed — "pendiente total" answers that.
    const kpis = planKpis(
      [
        plan({
          payments: [
            payment({
              sequence: 1,
              dueDate: "2026-08-05T00:00:00.000Z",
              paidAt: NOW.toISOString(),
              paidAmount: "10000.0000",
            }),
            payment({ sequence: 2, dueDate: "2026-08-25T00:00:00.000Z" }),
            payment({ sequence: 3, dueDate: "2026-09-05T00:00:00.000Z" }),
          ],
        }),
      ],
      NOW,
    );
    expect(kpis[0]!.thisMonth).toBe("20000.0000");
  });

  it("uses what an instalment OWES, carry-over included", () => {
    const kpis = planKpis(
      [
        plan({
          payments: [
            payment({
              sequence: 1,
              dueDate: "2026-08-25T00:00:00.000Z",
              carriedOverAmount: "3000.0000",
              dueAmount: "13000.0000",
            }),
          ],
        }),
      ],
      NOW,
    );
    expect(kpis[0]!.thisMonth).toBe("13000.0000");
  });
});

describe("planKpis — pending, next due, active count", () => {
  it("adds up each plan's remaining amount (FR-004b)", () => {
    const kpis = planKpis(
      [plan({ remainingAmount: "23000.0000" }), plan({ remainingAmount: "7000.0000" })],
      NOW,
    );
    expect(kpis[0]!.pendingTotal).toBe("30000.0000");
  });

  it("reports the earliest next due date across plans, and whether it is overdue", () => {
    const kpis = planKpis(
      [
        plan({ nextDueDate: "2026-09-05T00:00:00.000Z", status: "ON_TRACK" }),
        plan({ nextDueDate: "2026-08-10T00:00:00.000Z", status: "OVERDUE" }),
      ],
      NOW,
    );
    expect(kpis[0]!.nextDueDate).toBe("2026-08-10T00:00:00.000Z");
    expect(kpis[0]!.nextIsOverdue).toBe(true);
  });

  it("counts a PARTIALLY_PAID plan as active, and a PAID one as not (FR-003)", () => {
    const kpis = planKpis(
      [
        plan({ status: "PAID", remainingAmount: "0.0000", nextDueDate: null }),
        plan({ status: "PARTIALLY_PAID" }),
        plan({ status: "OVERDUE" }),
      ],
      NOW,
    );
    expect(kpis[0]!.activeCount).toBe(2);
  });
});

describe("planKpis — currencies", () => {
  it("groups by currency and never adds two currencies together (FR-005)", () => {
    const kpis = planKpis(
      [
        plan({ currency: "CLP", remainingAmount: "10000.0000" }),
        plan({ currency: "USD", remainingAmount: "50.0000" }),
      ],
      NOW,
    );
    expect(kpis).toHaveLength(2);
    expect(kpis.map((k) => k.currency).sort()).toEqual(["CLP", "USD"]);
    expect(kpis.find((k) => k.currency === "USD")?.pendingTotal).toBe("50.0000");
  });

  it("returns nothing at all for an empty list, rather than a row of zeros (FR-058)", () => {
    expect(planKpis([], NOW)).toEqual([]);
  });
});

describe("visiblePlans", () => {
  const overdue = plan({ id: "a", status: "OVERDUE", nextDueDate: "2026-08-10T00:00:00.000Z" });
  const soon = plan({ id: "b", status: "DUE_SOON", nextDueDate: "2026-08-20T00:00:00.000Z" });
  const faraway = plan({ id: "c", status: "ON_TRACK", nextDueDate: "2027-03-05T00:00:00.000Z" });
  const done = plan({ id: "d", status: "PAID", nextDueDate: null });
  const all = [faraway, done, soon, overdue];

  it("orders by next instalment ascending, finished plans last (FR-001a)", () => {
    expect(visiblePlans(all, "all", false, NOW).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("filters unpaid vs paid by plan state, counting PARTIALLY_PAID as unpaid", () => {
    const partial = plan({
      id: "e",
      status: "PARTIALLY_PAID",
      nextDueDate: "2026-08-30T00:00:00.000Z",
    });
    const ids = visiblePlans([...all, partial], "unpaid", false, NOW).map((p) => p.id);
    expect(ids).toContain("e");
    expect(ids).not.toContain("d");
    expect(visiblePlans(all, "paid", false, NOW).map((p) => p.id)).toEqual(["d"]);
  });

  it("INTERSECTS the state filter with the 3-month window (FR-008a)", () => {
    // "c" is unpaid but due in 2027, so the window drops it even under "unpaid".
    expect(visiblePlans(all, "unpaid", true, NOW).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("drops finished plans from the 3-month window: they have no next instalment", () => {
    expect(visiblePlans(all, "all", true, NOW).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("per-instalment helpers", () => {
  it("nextDuePayment picks the lowest unpaid sequence", () => {
    const rows = [payment({ sequence: 2 }), payment({ sequence: 1 })];
    expect(nextDuePayment(rows)?.sequence).toBe(1);
  });

  it("paymentStatus marks the oldest unpaid as upcoming and the rest as pending", () => {
    const rows = [payment({ sequence: 1 }), payment({ sequence: 2 })];
    expect(paymentStatus(rows[0]!, rows)).toBe("upcoming");
    expect(paymentStatus(rows[1]!, rows)).toBe("pending");
  });

  it("paymentStatus reports partial credit apart from paid", () => {
    const partial = payment({ sequence: 1, paidAmount: "6000.0000" });
    expect(paymentStatus(partial, [partial])).toBe("partial");
  });
});
