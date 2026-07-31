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

/** Any other cardable account that has grown an add-on CREDIT card: eligible
 * if the account is ACTIVE and it has at least one active CREDIT card
 * (primary or not). */
export class AddOnCardEligibility implements BillingEligibilityStrategy {
  applies(): boolean {
    return true; // fallback for every non-CREDIT_LINE account
  }

  evaluate(context: EligibilityContext): boolean {
    if (context.accountStatus !== "ACTIVE") return false;
    return context.cards.some((c) => c.kind === "CREDIT" && c.isActive);
  }
}

/** Picks the first strategy (in order) whose `applies()` matches — adding a
 * new account shape means adding a new strategy, never editing these. */
export function resolveBillingEligibility(context: EligibilityContext): boolean {
  const strategies: BillingEligibilityStrategy[] = [
    new CreditLineEligibility(),
    new AddOnCardEligibility(),
  ];
  const strategy = strategies.find((s) => s.applies(context));
  return strategy ? strategy.evaluate(context) : false;
}
