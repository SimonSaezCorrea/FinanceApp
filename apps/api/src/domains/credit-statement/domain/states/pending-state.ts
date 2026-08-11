import type { CreditStatementState } from "./credit-statement-state";

/** Already closed by generation, awaiting payment — `amount` is still LIVE
 * (computed from its linked transactions). */
export class PendingState implements CreditStatementState {
  readonly name = "PENDING" as const;

  canClose(): boolean {
    return false;
  }

  canPay(): boolean {
    return true;
  }
}
