import type { CreditStatementState } from "./credit-statement-state";

/**
 * Closed and paid into, but not settled: some of the period has been paid and a
 * balance is still owed.
 *
 * It accepts further payments — that is the whole point of a partial one. Its
 * `amount` is still the LIVE sum of the period's linked transactions and only
 * freezes once the period is settled.
 */
export class PartiallyPaidState implements CreditStatementState {
  readonly name = "PARTIALLY_PAID" as const;

  canClose(): boolean {
    return false;
  }

  canPay(): boolean {
    return true;
  }
}
