import { sumMoney, toMoney } from "@finance/money";
import { describe, expect, it } from "vitest";

import {
  applyCarryOver,
  type CarryablePayment,
  outstandingOn,
  owedBy,
  reverseCarryOver,
} from "../../../../src/domains/installment-plan/domain/installment-carry-over";

/**
 * The arithmetic of the carry-over, in isolation from persistence.
 *
 * The rule it encodes: paying an installment NEVER rewrites the schedule (FR-020).
 * Whatever a payment fails to cover is carried into the next unpaid installment
 * (FR-021), a surplus is subtracted from it and keeps flowing while it lasts
 * (FR-021a), and undoing a payment reverses exactly what that payment caused
 * (FR-024) — not what the installment itself inherited.
 */

function payments(...rows: Array<Partial<CarryablePayment>>): CarryablePayment[] {
  return rows.map((r, i) => ({
    sequence: i + 1,
    amount: "10000.0000",
    carriedOverAmount: "0.0000",
    paidAt: null,
    paidAmount: null,
    ...r,
  }));
}

/** INV-C4: nothing is lost and nothing is invented, whatever the payment sequence. */
function conserves(rows: CarryablePayment[], scheduledTotal: string): boolean {
  const paid = sumMoney(rows.map((p) => p.paidAmount ?? "0"));
  const owed = sumMoney(rows.map(outstandingOn));
  return toMoney(sumMoney([paid, owed])).equals(toMoney(scheduledTotal));
}

describe("owedBy", () => {
  it("is the scheduled amount plus what was carried in", () => {
    expect(owedBy({ amount: "10000", carriedOverAmount: "2500" } as CarryablePayment)).toBe(
      "12500.0000",
    );
  });

  it("never goes below zero when a surplus exceeds the installment", () => {
    expect(owedBy({ amount: "10000", carriedOverAmount: "-15000" } as CarryablePayment)).toBe(
      "0.0000",
    );
  });
});

describe("applyCarryOver — shortfall", () => {
  it("carries the uncovered part into the NEXT unpaid installment", () => {
    const rows = payments({}, {}, {});
    const result = applyCarryOver(rows, 1, "7000");

    expect(result.settled).toBe(true);
    expect(result.deltas).toEqual([{ sequence: 2, delta: "3000.0000" }]);
  });

  it("leaves every other installment's SCHEDULED amount untouched (FR-020)", () => {
    const rows = payments({}, {}, {});
    applyCarryOver(rows, 1, "7000");

    expect(rows.map((p) => p.amount)).toEqual(["10000.0000", "10000.0000", "10000.0000"]);
  });

  it("chains: consecutive short payments accumulate, losing nothing", () => {
    const rows = payments({}, {}, {});
    const total = "30000.0000";

    const first = applyCarryOver(rows, 1, "7000");
    commit(rows, 1, "7000", first);
    expect(conserves(rows, total)).toBe(true);

    // Installment 2 now owes 10000 + 3000 = 13000; paying 8000 leaves 5000.
    expect(owedBy(rows[1])).toBe("13000.0000");
    const second = applyCarryOver(rows, 2, "8000");
    commit(rows, 2, "8000", second);

    expect(rows[2].carriedOverAmount).toBe("5000.0000");
    expect(conserves(rows, total)).toBe(true);
  });

  it("skips an installment already paid out of order (FR-021c)", () => {
    // 2 was paid first (undo makes this reachable): the carry from 1 must land on 3.
    const rows = payments({}, { paidAt: new Date(), paidAmount: "10000.0000" }, {});
    const result = applyCarryOver(rows, 1, "7000");

    expect(result.deltas).toEqual([{ sequence: 3, delta: "3000.0000" }]);
  });

  it("does NOT carry when the short payment is on the last unpaid installment (FR-023)", () => {
    const rows = payments({ paidAt: new Date(), paidAmount: "10000.0000" }, {});
    const result = applyCarryOver(rows, 2, "6000");

    expect(result.deltas).toEqual([]);
    // The installment is NOT settled: it stays payable for the remainder, which is
    // what keeps the plan active instead of quietly forgiving 4000.
    expect(result.settled).toBe(false);
    expect(result.shortfall).toBe("4000.0000");
  });
});

describe("applyCarryOver — surplus", () => {
  it("subtracts an overpayment from the next unpaid installment", () => {
    const rows = payments({}, {}, {});
    const result = applyCarryOver(rows, 1, "13000");

    expect(result.deltas).toEqual([{ sequence: 2, delta: "-3000.0000" }]);
  });

  it("keeps flowing through several installments when it exceeds one (FR-021a)", () => {
    const rows = payments({}, {}, {}, {});
    // 25000 on a 10000 installment: 15000 spare swallows #2 whole and dents #3.
    const result = applyCarryOver(rows, 1, "25000");

    expect(result.deltas).toEqual([
      { sequence: 2, delta: "-10000.0000" },
      { sequence: 3, delta: "-5000.0000" },
    ]);
  });

  it("never drives an installment below zero owed", () => {
    const rows = payments({}, {}, {}, {});
    applyCarryOver(rows, 1, "25000").deltas.forEach(({ sequence, delta }) => {
      const row = rows[sequence - 1];
      row.carriedOverAmount = delta;
      expect(toMoney(owedBy(row)).greaterThanOrEqualTo(0)).toBe(true);
    });
  });

  it("reports the excess that has nowhere left to go (FR-021b rejects it upstream)", () => {
    const rows = payments({}, {});
    const result = applyCarryOver(rows, 1, "35000");

    expect(result.unappliedSurplus).toBe("15000.0000");
  });
});

describe("reverseCarryOver", () => {
  it("undoes exactly the deltas the payment produced", () => {
    const rows = payments({}, {}, {});
    const applied = applyCarryOver(rows, 1, "7000");
    commit(rows, 1, "7000", applied);

    const reversal = reverseCarryOver(applied.deltas);
    expect(reversal).toEqual([{ sequence: 2, delta: "-3000.0000" }]);
  });

  it("does not touch what the undone installment itself INHERITED", () => {
    // 1 paid short → 2 carries 3000. Undoing 2's own later payment must leave that
    // 3000 alone: it belongs to payment 1, which still stands.
    const rows = payments({}, { carriedOverAmount: "3000.0000" }, {});
    const applied = applyCarryOver(rows, 2, "13000");
    commit(rows, 2, "13000", applied);

    reverseCarryOver(applied.deltas);
    expect(rows[1].carriedOverAmount).toBe("3000.0000");
  });
});

describe("INV-C4 conservation over an arbitrary sequence", () => {
  it("holds across mixed short, exact and over payments", () => {
    const rows = payments({}, {}, {}, {}, {});
    const total = "50000.0000";
    const script: Array<[number, string]> = [
      [1, "6000"],
      [2, "20000"],
      [3, "1000"],
      [4, "9000"],
    ];

    for (const [sequence, paid] of script) {
      const result = applyCarryOver(rows, sequence, paid);
      commit(rows, sequence, paid, result);
      expect(conserves(rows, total)).toBe(true);
    }
  });
});

/** Applies a computed result to the rows, the way the aggregate will. */
function commit(
  rows: CarryablePayment[],
  sequence: number,
  paid: string,
  result: ReturnType<typeof applyCarryOver>,
): void {
  const row = rows[sequence - 1];
  row.paidAt = new Date();
  row.paidAmount = toMoney(paid).toFixed(4);
  for (const { sequence: target, delta } of result.deltas) {
    const t = rows[target - 1];
    t.carriedOverAmount = sumMoney([t.carriedOverAmount, delta]);
  }
}
