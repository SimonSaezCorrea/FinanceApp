import { describe, expect, it } from "vitest";

import type { debts } from "@finance/contracts";

import { debtSchedule } from "./debtSchedule";

function makeDebt(overrides: Partial<debts.Debt> = {}): debts.Debt {
  return {
    id: "d1",
    direction: "YOU_OWE",
    counterparty: "Test",
    principal: "1000.0000",
    currency: "CLP",
    openedAt: "2026-01-01T00:00:00.000Z",
    // Mid-month on purpose: parsing a stored UTC instant back into a LOCAL
    // calendar day (as every `toLocaleDateString`/plain `Date` field in this
    // app does) can shift it by a few hours near midnight — day 15 is far
    // enough from a month boundary that the shift never crosses it, same
    // convention `schedulePreview.test.ts`'s own fixtures use.
    dueAt: "2026-02-15T00:00:00.000Z",
    interestApr: null,
    title: null,
    notes: null,
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("debtSchedule", () => {
  it("produces one row, dated at dueAt, for a single-payment debt", () => {
    const schedule = debtSchedule(makeDebt());
    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.sequence).toBe(1);
    expect(schedule[0]!.amount).toBe("1000.0000");
    expect(schedule[0]!.dueDate?.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("steps monthly from dueAt (read as the FIRST instalment) across the count", () => {
    const schedule = debtSchedule(
      makeDebt({ totalInstallments: 3, frequency: "MONTHLY", frequencyInterval: 1 }),
    );
    expect(schedule.map((s) => s.dueDate?.toISOString().slice(0, 10))).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("marks paid instalments below the counter, the next one, and the rest pending", () => {
    const schedule = debtSchedule(makeDebt({ totalInstallments: 4, paidInstallments: 2 }));
    expect(schedule.map((s) => s.status)).toEqual(["paid", "paid", "next", "pending"]);
  });

  it("marks every instalment paid once the debt is settled", () => {
    const schedule = debtSchedule(
      makeDebt({
        totalInstallments: 4,
        paidInstallments: 1,
        settledAt: "2026-02-05T00:00:00.000Z",
      }),
    );
    expect(schedule.every((s) => s.status === "paid")).toBe(true);
  });

  it("the last instalment absorbs the rounding remainder when principal doesn't split evenly", () => {
    const schedule = debtSchedule(
      makeDebt({ totalInstallments: 3, principal: "1000.0000", installmentAmount: null }),
    );
    const total = schedule.reduce((sum, s) => sum + Number(s.amount), 0);
    expect(total).toBeCloseTo(1000, 4);
  });
});
