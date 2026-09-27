import { describe, expect, it } from "vitest";

import type { recurring } from "@finance/contracts";

import { activeOnly, isOverdue } from "./recurringMetrics";

const series = (over: Partial<recurring.RecurringExpense>): recurring.RecurringExpense => ({
  id: "r",
  label: "Spotify",
  amount: "6990",
  currency: "CLP",
  categoryId: null,
  frequency: "MONTHLY",
  interval: 1,
  anchorDate: "2026-01-01T00:00:00.000Z",
  bankAccountId: null,
  cardId: null,
  active: true,
  endDate: null,
  status: "ACTIVE",
  notes: null,
  nextDueAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("recurring status in the metrics", () => {
  it("only ACTIVE series count toward totals — paused and finished don't", () => {
    const list = [
      series({ id: "a" }),
      series({ id: "p", active: false, status: "PAUSED" }),
      series({ id: "f", status: "FINISHED", endDate: "2026-04-01T00:00:00.000Z", nextDueAt: null }),
    ];
    expect(activeOnly(list).map((r) => r.id)).toEqual(["a"]);
  });

  it("a finished series is never overdue", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(isOverdue(series({}), now)).toBe(true);
    expect(isOverdue(series({ status: "FINISHED", nextDueAt: null }), now)).toBe(false);
  });
});
