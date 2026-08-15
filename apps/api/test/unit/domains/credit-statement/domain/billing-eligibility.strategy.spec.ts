import { describe, expect, it } from "vitest";

import {
  NoCreditLineEligibility,
  CreditLineEligibility,
  resolveBillingEligibility,
} from "../../../../../src/domains/credit-statement/domain/billing-eligibility.strategy";

describe("BillingEligibilityStrategy", () => {
  describe("CreditLineEligibility", () => {
    const strategy = new CreditLineEligibility();

    it("applies only to CREDIT_CARD accounts", () => {
      expect(
        strategy.applies({ accountType: "CREDIT_CARD", accountStatus: "ACTIVE", cards: [] }),
      ).toBe(true);
      expect(
        strategy.applies({ accountType: "CHECKING", accountStatus: "ACTIVE", cards: [] }),
      ).toBe(false);
    });

    it("eligible only if ACTIVE + its primary CREDIT card is active", () => {
      const active = {
        accountType: "CREDIT_CARD",
        accountStatus: "ACTIVE" as const,
        cards: [{ kind: "CREDIT", isPrimary: true, isActive: true }],
      };
      expect(strategy.evaluate(active)).toBe(true);
      expect(strategy.evaluate({ ...active, accountStatus: "INACTIVE" })).toBe(false);
      expect(
        strategy.evaluate({
          ...active,
          cards: [{ kind: "CREDIT", isPrimary: true, isActive: false }],
        }),
      ).toBe(false);
    });
  });

  describe("NoCreditLineEligibility", () => {
    const strategy = new NoCreditLineEligibility();

    it("applies as the fallback for any account shape", () => {
      expect(strategy.applies()).toBe(true);
    });

    it("is never eligible: a cash account carries no credit card to bill", () => {
      expect(strategy.evaluate()).toBe(false);
    });
  });

  describe("resolveBillingEligibility", () => {
    it("picks CreditLineEligibility for CREDIT_CARD accounts", () => {
      expect(
        resolveBillingEligibility({
          accountType: "CREDIT_CARD",
          accountStatus: "ACTIVE",
          cards: [{ kind: "CREDIT", isPrimary: true, isActive: true }],
        }),
      ).toBe(true);
    });

    it("never bills a checking account, which can no longer carry a credit card", () => {
      expect(
        resolveBillingEligibility({
          accountType: "CHECKING",
          accountStatus: "ACTIVE",
          cards: [{ kind: "DEBIT", isPrimary: false, isActive: true }],
        }),
      ).toBe(false);
    });

    it("is never eligible for a prepaid account: it has no credit line to bill", () => {
      expect(
        resolveBillingEligibility({
          accountType: "PREPAID",
          accountStatus: "ACTIVE",
          cards: [{ kind: "PREPAID", isPrimary: false, isActive: true }],
        }),
      ).toBe(false);
    });

    it("is false when there are no cards at all", () => {
      expect(
        resolveBillingEligibility({ accountType: "CHECKING", accountStatus: "ACTIVE", cards: [] }),
      ).toBe(false);
    });
  });
});
