import type { accounts } from "@finance/contracts";

/**
 * `billing-settings` table — the credit-billing configuration of ONE bank
 * account (1:1 via a unique `accountId`). Kept as its own table (and now its own
 * domain) so this config can be reviewed/maintained independently of the
 * accounts table. Purely configuration: it holds no money and enforces no rule
 * beyond the shape below; WHEN a cycle closes is `credit-statement`'s business.
 */
export interface BillingSettingsProps {
  /** Meaning depends on `cycleType`: a day-of-month (1-28) for CALENDAR_DAY, or
   * a count of business days for BUSINESS_DAY. Null while unconfigured (no
   * automatic closing happens then). */
  billingCycleDay: number | null;
  /** Días hábiles (default) or a fixed day-of-month. */
  cycleType: accounts.BillingCycleType;
  paymentMethod: accounts.BillingPaymentMethod;
  /** Business days directly after a period's own close at which payment is
   * due (e.g. BCI's real-world "3 días hábiles"). Null = no due date shown. */
  paymentDueDay: number | null;
  /** Percentage of a statement that counts as its minimum payment ("5" = 5%).
   * Null = this account has no minimum, and none is offered when paying. */
  minimumPaymentPercent: string | null;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettingsProps = {
  billingCycleDay: null,
  cycleType: "BUSINESS_DAY",
  paymentMethod: "MANUAL",
  paymentDueDay: null,
  minimumPaymentPercent: null,
};
