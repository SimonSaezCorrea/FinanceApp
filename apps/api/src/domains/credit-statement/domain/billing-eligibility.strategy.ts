export interface EligibilityCard {
  kind: string;
  isPrimary: boolean;
  isActive: boolean;
}

export interface EligibilityContext {
  accountType: string;
  accountStatus: "ACTIVE" | "INACTIVE";
  cards: EligibilityCard[];
}

/**
 * Strategy (FR-006): "is this account/card configuration eligible to close
 * its current billing period right now" varies by account shape and is
 * likely to grow more categories (e.g. a future account type) — modeled as
 * one interchangeable strategy per category instead of an if/else chain.
 */
export interface BillingEligibilityStrategy {
  applies(context: EligibilityContext): boolean;
  evaluate(context: EligibilityContext): boolean;
}

/** A standalone credit-line account: eligible only if the account itself is
 * ACTIVE and its primary CREDIT card is active. */
export class CreditLineEligibility implements BillingEligibilityStrategy {
  applies(context: EligibilityContext): boolean {
    return context.accountType === "CREDIT_LINE";
  }

  evaluate(context: EligibilityContext): boolean {
    if (context.accountStatus !== "ACTIVE") return false;
    return context.cards.some((c) => c.kind === "CREDIT" && c.isPrimary && c.isActive);
  }
}

/**
 * Every other account type: never eligible, because it holds cash (or provisioned
 * funds) and carries no CREDIT card — a credit card is its own `CREDIT_LINE`
 * account, not an add-on to a checking one (`ALLOWED_CARD_KINDS`). Kept as an
 * explicit strategy rather than a `return false` fallback so the reason is
 * stated where the decision is made, and so a future credit-bearing shape is
 * added as a new strategy instead of an `if`.
 */
export class NoCreditLineEligibility implements BillingEligibilityStrategy {
  applies(): boolean {
    return true; // fallback for every non-CREDIT_LINE account
  }

  evaluate(): boolean {
    return false;
  }
}

/** Picks the first strategy (in order) whose `applies()` matches — adding a
 * new account shape means adding a new strategy, never editing these. */
export function resolveBillingEligibility(context: EligibilityContext): boolean {
  const strategies: BillingEligibilityStrategy[] = [
    new CreditLineEligibility(),
    new NoCreditLineEligibility(),
  ];
  const strategy = strategies.find((s) => s.applies(context));
  return strategy ? strategy.evaluate(context) : false;
}
