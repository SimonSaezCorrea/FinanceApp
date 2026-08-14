import type { CreditStatementState } from "./credit-statement-state";

/**
 * Settled with LESS than the period's total: the payment covered part of it and
 * the rest was carried into the next period (`carriedToId`), so this one is as
 * closed as a fully paid one — it can be neither closed nor paid again.
 *
 * It exists purely so the period reports what actually happened instead of
 * claiming "Pagada": the same terminal behavior as `PaidState`, a different name.
 */
export class PartiallyPaidState implements CreditStatementState {
  readonly name = "PARTIALLY_PAID" as const;

  canClose(): boolean {
    return false;
  }

  canPay(): boolean {
    return false;
  }
}
