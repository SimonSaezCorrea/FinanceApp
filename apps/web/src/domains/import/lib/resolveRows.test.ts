import { describe, expect, it } from "vitest";

import type { ParsedRow } from "./importParsing";
import { resolveRows, type ResolveOptions } from "./resolveRows";

const base: ParsedRow = {
  sourceRow: 2,
  type: "EXPENSE",
  amount: "1000",
  date: "2026-09-01",
  description: "",
  observation: "",
  emisor: "",
  receptor: "",
  lugar: "",
  categoryText: "",
  cardText: "",
  financeCharge: false,
};

const options: ResolveOptions = {
  accountType: "CHECKING",
  categories: [
    { id: "super", names: ["Supermercado"], kind: "EXPENSE", isSystem: false },
    { id: "salary", names: ["Sueldo"], kind: "INCOME", isSystem: false },
    { id: "other", names: ["Otros"], kind: "BOTH", isSystem: false },
    { id: "savings", names: ["Ahorro"], kind: "BOTH", isSystem: true },
  ],
  cards: [{ id: "visa", last4: "4521" }],
  defaultCategoryId: "other",
  defaultCardId: null,
};

describe("resolveRows", () => {
  it("matches the category and the card, counting what matched", () => {
    const { rows, stats } = resolveRows(
      [{ ...base, categoryText: "SUPERMERCADO", cardText: "•••• 4521" }],
      options,
    );
    expect(rows[0]).toMatchObject({ categoryId: "super", cardId: "visa" });
    expect(stats).toEqual({ categoriesMatched: 1, categoriesUnmatched: 0, cardsUnmatched: 0 });
  });

  it("falls back to the default category, and never uses one of the other type", () => {
    const { rows, stats } = resolveRows(
      [
        { ...base, categoryText: "Streaming" },
        // "Sueldo" is an INCOME category: on an expense it doesn't fit.
        { ...base, categoryText: "Sueldo" },
      ],
      options,
    );
    expect(rows.map((r) => r.categoryId)).toEqual(["other", "other"]);
    expect(stats.categoriesUnmatched).toBe(2);
  });

  it("never lands a system category, even if its name matches", () => {
    const { rows } = resolveRows([{ ...base, categoryText: "Ahorro" }], {
      ...options,
      defaultCategoryId: null,
    });
    expect(rows[0]!.categoryId).toBeNull();
  });

  it("keeps a card off incomes and cash accounts, and reports an unknown one", () => {
    const { rows, stats } = resolveRows(
      [
        { ...base, type: "INCOME", cardText: "4521" },
        { ...base, cardText: "7710" },
      ],
      { ...options, defaultCardId: "visa" },
    );
    expect(rows[0]!.cardId).toBeNull();
    // An unknown card falls back to the default one.
    expect(rows[1]!.cardId).toBe("visa");
    expect(stats.cardsUnmatched).toBe(1);

    const cash = resolveRows([{ ...base, cardText: "4521" }], { ...options, accountType: "CASH" });
    expect(cash.rows[0]!.cardId).toBeNull();
  });

  it("only honours an issuer charge on a credit card account, and gives it no card", () => {
    const flagged = { ...base, financeCharge: true, cardText: "4521" };
    const credit = resolveRows([flagged], { ...options, accountType: "CREDIT_CARD" });
    expect(credit.rows[0]).toMatchObject({ financeCharge: true, cardId: null });
    const checking = resolveRows([flagged], options);
    expect(checking.rows[0]!.financeCharge).toBe(false);
  });
});
