import { describe, expect, it } from "vitest";

import type { transactions } from "@finance/contracts";

import { excludeTransfers, expensesByCategory, monthFlow } from "./metrics";

const tx = (over: Partial<transactions.Transaction>): transactions.Transaction => ({
  id: "t1",
  type: "EXPENSE",
  amount: "1000",
  currency: "CLP",
  occurredAt: "2026-08-01T00:00:00.000Z",
  category: "Comida",
  description: null,
  observation: null,
  emisor: null,
  receptor: null,
  lugar: null,
  bankAccountId: "a1",
  cardId: null,
  installmentPlanId: null,
  transferGroupId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const transferPair = [
  tx({ id: "x1", type: "EXPENSE", amount: "5000", transferGroupId: "g1", category: "Traspaso" }),
  tx({ id: "x2", type: "INCOME", amount: "5000", transferGroupId: "g1", category: "Traspaso" }),
];

describe("dashboard metrics exclude transfers", () => {
  it("month flow ignores both legs", () => {
    const withoutTransfer = monthFlow([tx({ id: "a", type: "INCOME", amount: "3000" })]);
    const withTransfer = monthFlow([
      tx({ id: "a", type: "INCOME", amount: "3000" }),
      ...transferPair,
    ]);
    expect(withTransfer).toEqual(withoutTransfer);
  });

  it("the category donut ignores the outgoing leg", () => {
    const slices = expensesByCategory([tx({ id: "a" }), ...transferPair]);
    expect(slices).toEqual([{ category: "Comida", total: "1000.0000" }]);
  });

  it("excludeTransfers keeps ordinary movements", () => {
    expect(excludeTransfers([tx({ id: "a" }), ...transferPair]).map((t) => t.id)).toEqual(["a"]);
  });
});
