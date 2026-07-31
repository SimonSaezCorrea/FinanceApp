import { describe, expect, it } from "vitest";

import {
  AddOnCardEligibility,
  CreditLineEligibility,
  resolveBillingEligibility,
} from "../../../../../src/domains/credit-statement/domain/billing-eligibility.strategy";

describe("BillingEligibilityStrategy", () => {
  describe("CreditLineEligibility", () => {
    const strategy = new CreditLineEligibility();

    it("applies only to CREDIT_LINE accounts", () => {
      expect(strategy.applies({ accountType: "CREDIT_LINE", accountStatus: "ACTIVE", cards: [] })).toBe(true);
      expect(strategy.applies({ accountType: "CHECKING", accountStatus: "ACTIVE", cards: [] })).toBe(false);
    });

    it("eligible only if ACTIVE + its primary CREDIT card is active", () => {
      const active = {
        accountType: "CREDIT_LINE",
        accountStatus: "ACTIVE" as const,
        cards: [{ kind: "CREDIT", isPrimary: true, isActive: true }],
      };
      expect(strategy.evaluate(active)).toBe(true);
      expect(strategy.evaluate({ ...active, accountStatus: "INACTIVE" })).toBe(false);
      expect(
        strategy.evaluate({ ...active, cards: [{ kind: "CREDIT", isPrimary: true, isActive: false }] }),
      ).toBe(false);
    });
  });

  describe("AddOnCardEligibility", () => {
    const strategy = new AddOnCardEligibility();

    it("applies as the fallback for any account shape", () => {
      expect(strategy.applies()).toBe(true);
    });

    it("eligible if ACTIVE + at least one active CREDIT card (primary or not)", () => {
      const ctx = {
        accountType: "CHECKING",
        accountStatus: "ACTIVE" as const,
        cards: [{ kind: "CREDIT", isPrimary: false, isActive: true }],
      };
      expect(strategy.evaluate(ctx)).toBe(true);
      expect(strategy.evaluate({ ...ctx, accountStatus: "INACTIVE" })).toBe(false);
    });
  });

  describe("resolveBillingEligibility", () => {
    it("picks CreditLineEligibility for CREDIT_LINE accounts", () => {
      expect(
        resolveBillingEligibility({
          accountType: "CREDIT_LINE",
          accountStatus: "ACTIVE",
          cards: [{ kind: "CREDIT", isPrimary: true, isActive: true }],
        }),
      ).toBe(true);
    });

    it("picks AddOnCardEligibility for any other account type", () => {
      expect(
        resolveBillingEligibility({
          accountType: "CHECKING",
          accountStatus: "ACTIVE",
          cards: [{ kind: "CREDIT", isPrimary: false, isActive: true }],
        }),
      ).toBe(true);
    });

    it("is false when there are no cards at all", () => {
      expect(resolveBillingEligibility({ accountType: "CHECKING", accountStatus: "ACTIVE", cards: [] })).toBe(false);
    });
  });
});
