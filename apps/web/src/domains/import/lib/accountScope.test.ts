import { describe, expect, it } from "vitest";

import { scopeExistingData, scopeExistingRows } from "./accountScope";
import type { ExistingData, ExistingRows } from "./templateData";

const tx = (over: Record<string, unknown>) =>
  ({
    id: "t",
    bankAccountId: "a1",
    transferGroupId: null,
    debtId: null,
    installmentPlanId: null,
    recurringExpenseId: null,
    ...over,
  }) as unknown as ExistingData["transactions"][number];

const data = {
  accounts: [
    { id: "a1", cards: [{ id: "c1" }] },
    { id: "a2", cards: [{ id: "c2" }] },
  ],
  transactions: [
    tx({ id: "own", debtId: "d1" }),
    tx({ id: "out", transferGroupId: "g1" }),
    tx({ id: "in", bankAccountId: "a2", transferGroupId: "g1" }),
    tx({ id: "other", bankAccountId: "a2" }),
  ],
  statements: [
    { id: "s1", accountId: "a1" },
    { id: "s2", accountId: "a2" },
  ],
  debts: [
    { id: "d1", paymentAccountId: null },
    { id: "d2", paymentAccountId: "a2" },
  ],
  plans: [
    { id: "p1", cardId: "c1", paymentAccountId: null },
    { id: "p2", cardId: "c2", paymentAccountId: null },
  ],
  recurring: [
    { id: "r1", bankAccountId: "a1" },
    { id: "r2", bankAccountId: null },
  ],
  goals: [{ id: "g-1" }, { id: "g-2" }],
  entries: [
    { id: "e1", bankAccountId: "a1", savingsGoalId: "g-1" },
    { id: "e2", bankAccountId: "a2", savingsGoalId: "g-2" },
  ],
  categories: [],
} as unknown as ExistingData;

describe("scopeExistingData", () => {
  it("keeps only what the account is involved in, with both legs of its transfers", () => {
    const scoped = scopeExistingData(data, "a1");
    expect(scoped.transactions.map((t) => t.id)).toEqual(["own", "out", "in"]);
    expect(scoped.statements.map((s) => s.id)).toEqual(["s1"]);
    expect(scoped.debts.map((d) => d.id)).toEqual(["d1"]);
    expect(scoped.plans.map((p) => p.id)).toEqual(["p1"]);
    expect(scoped.recurring.map((r) => r.id)).toEqual(["r1"]);
    expect(scoped.entries.map((e) => e.id)).toEqual(["e1"]);
    expect(scoped.goals.map((g) => g.id)).toEqual(["g-1"]);
    // Every account stays: a transfer row names the other side.
    expect(scoped.accounts).toHaveLength(2);
  });
});

describe("scopeExistingRows", () => {
  it("keeps the account's own row and its cards", () => {
    const rows = {
      accounts: [
        { id: "a1", cells: {} },
        { id: "a2", cells: {} },
      ],
      cards: [
        { id: "c1", cells: {} },
        { id: "c2", cells: {} },
      ],
      movements: [{ id: "own", cells: {} }],
    } as unknown as ExistingRows;
    const scoped = scopeExistingRows(rows, { id: "a1", cards: [{ id: "c1" }] });
    expect(scoped.accounts.map((r) => r.id)).toEqual(["a1"]);
    expect(scoped.cards.map((r) => r.id)).toEqual(["c1"]);
    expect(scoped.movements).toHaveLength(1);
  });
});
