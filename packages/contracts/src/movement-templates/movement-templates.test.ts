import { describe, expect, it } from "vitest";

import {
  MOVEMENT_TEMPLATE_NAME_MAX,
  normalizeTemplateName,
  saveMovementTemplateSchema,
} from "./index";

const ACCOUNT = "0192f0a0-0000-7000-8000-000000000001";
const CARD = "0192f0a0-0000-7000-8000-000000000002";

describe("saveMovementTemplateSchema", () => {
  it("accepts a name and a type alone (everything else optional)", () => {
    const parsed = saveMovementTemplateSchema.parse({ name: "  Bencina ", type: "EXPENSE" });
    expect(parsed.name).toBe("Bencina");
  });

  it("rejects an empty or too long name", () => {
    expect(saveMovementTemplateSchema.safeParse({ name: "  ", type: "EXPENSE" }).success).toBe(
      false,
    );
    expect(
      saveMovementTemplateSchema.safeParse({
        name: "x".repeat(MOVEMENT_TEMPLATE_NAME_MAX + 1),
        type: "EXPENSE",
      }).success,
    ).toBe(false);
  });

  it("needs a currency with an amount, and a positive amount", () => {
    const base = { name: "Arriendo", type: "EXPENSE" as const };
    expect(saveMovementTemplateSchema.safeParse({ ...base, amount: "450000" }).success).toBe(false);
    expect(
      saveMovementTemplateSchema.safeParse({ ...base, amount: "450000", currency: "CLP" }).success,
    ).toBe(true);
    expect(
      saveMovementTemplateSchema.safeParse({ ...base, amount: "0.00", currency: "CLP" }).success,
    ).toBe(false);
    expect(
      saveMovementTemplateSchema.safeParse({ ...base, amount: "-5", currency: "CLP" }).success,
    ).toBe(false);
  });

  it("refuses a card without its account", () => {
    expect(
      saveMovementTemplateSchema.safeParse({ name: "X", type: "EXPENSE", cardId: CARD }).success,
    ).toBe(false);
    expect(
      saveMovementTemplateSchema.safeParse({
        name: "X",
        type: "EXPENSE",
        cardId: CARD,
        bankAccountId: ACCOUNT,
      }).success,
    ).toBe(true);
  });

  it("keeps a finance charge an expense with no card", () => {
    expect(
      saveMovementTemplateSchema.safeParse({ name: "X", type: "INCOME", financeCharge: true })
        .success,
    ).toBe(false);
    expect(
      saveMovementTemplateSchema.safeParse({
        name: "X",
        type: "EXPENSE",
        financeCharge: true,
        bankAccountId: ACCOUNT,
        cardId: CARD,
      }).success,
    ).toBe(false);
  });
});

describe("normalizeTemplateName", () => {
  it("ignores case, accents and repeated spaces", () => {
    expect(normalizeTemplateName("  Café   Mañana ")).toBe(normalizeTemplateName("cafe manana"));
  });
});
