import { describe, expect, it } from "vitest";

import {
  areValidExtraCreditLimits,
  createBankAccountSchema,
  needsPrimaryCard,
  replacePrimaryCardSchema,
} from "./index";

const CARD_ID = "01900000-0000-7000-8000-000000000001";

describe("extraCreditLimits on create", () => {
  const base = { name: "Visa", type: "CREDIT_CARD" as const, currency: "CLP", creditLimit: "1000" };

  it("accepts credit in another currency on a credit card account", () => {
    const r = createBankAccountSchema.safeParse({
      ...base,
      extraCreditLimits: [{ currency: "USD", limitAmount: "3000" }],
    });
    expect(r.success).toBe(true);
  });

  it("refuses it on any other account type", () => {
    const r = createBankAccountSchema.safeParse({
      name: "Corriente",
      type: "CHECKING",
      accountNumber: "1",
      extraCreditLimits: [{ currency: "USD", limitAmount: "3000" }],
    });
    expect(r.success).toBe(false);
  });

  it("refuses the account's own currency, a repeated one and a non-positive limit", () => {
    expect(areValidExtraCreditLimits("CLP", [{ currency: "CLP", limitAmount: "1" }])).toBe(false);
    expect(
      areValidExtraCreditLimits("CLP", [
        { currency: "USD", limitAmount: "1" },
        { currency: "USD", limitAmount: "2" },
      ]),
    ).toBe(false);
    expect(areValidExtraCreditLimits("CLP", [{ currency: "USD", limitAmount: "0" }])).toBe(false);
    expect(areValidExtraCreditLimits("CLP", undefined)).toBe(true);
  });
});

describe("replacePrimaryCardSchema", () => {
  it("takes an existing card or a new one, never both", () => {
    expect(
      replacePrimaryCardSchema.safeParse({ action: "DEACTIVATE", replacement: { cardId: CARD_ID } })
        .success,
    ).toBe(true);
    expect(
      replacePrimaryCardSchema.safeParse({
        action: "DELETE",
        replacement: {
          newCard: { name: "Visa nueva", last4: "1234", expiryMonth: 5, expiryYear: 2031 },
        },
      }).success,
    ).toBe(true);
    expect(
      replacePrimaryCardSchema.safeParse({
        action: "DEACTIVATE",
        replacement: {
          cardId: CARD_ID,
          newCard: { name: "x", last4: "1234", expiryMonth: 5, expiryYear: 2031 },
        },
      }).success,
    ).toBe(false);
  });

  it("refuses a new card without four digits", () => {
    expect(
      replacePrimaryCardSchema.safeParse({
        action: "DEACTIVATE",
        replacement: { newCard: { name: "x", last4: "12", expiryMonth: 5, expiryYear: 2031 } },
      }).success,
    ).toBe(false);
  });
});

describe("needsPrimaryCard", () => {
  const card = (
    over: Partial<{ kind: "CREDIT" | "DEBIT"; isPrimary: boolean; isActive: boolean }>,
  ) => ({
    kind: "CREDIT" as const,
    isPrimary: false,
    isActive: true,
    ...over,
  });

  it("is true when credit cards have no active primary", () => {
    expect(
      needsPrimaryCard({ cards: [card({ isPrimary: true, isActive: false }), card({})] }),
    ).toBe(true);
  });

  it("is false with an active primary, or with no credit cards", () => {
    expect(needsPrimaryCard({ cards: [card({ isPrimary: true })] })).toBe(false);
    expect(needsPrimaryCard({ cards: [card({ kind: "DEBIT" })] })).toBe(false);
  });
});
