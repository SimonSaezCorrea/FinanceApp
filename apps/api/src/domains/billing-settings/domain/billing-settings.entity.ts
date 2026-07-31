import type { accounts } from "@finance/contracts";

/**
 * `billing-settings` table — the credit-billing configuration of ONE bank
 * account (1:1 via a unique `accountId`). Kept as its own table (and now its own
 * domain) so this config can be reviewed/maintained independently of the
 * accounts table. Purely configuration: it holds no money and enforces no rule
 * beyond the shape below; WHEN a cycle closes is `credit-statement`'s business.
 */
export interface BillingSettingsProps {
  /** 1-28, or null while unconfigured (no automatic closing happens then). */
  billingCycleDay: number | null;
  paymentMethod: accounts.BillingPaymentMethod;
  /** Reserved — the "AUTOMATIC" flow is not implemented (see docs/PENDING.md). */
  paymentDueDay: number | null;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettingsProps = {
  billingCycleDay: null,
  paymentMethod: "MANUAL",
  paymentDueDay: null,
};
