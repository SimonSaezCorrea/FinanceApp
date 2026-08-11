import type { CreditStatementState } from "./credit-statement-state";

/** Frozen at pay time — can never be paid again, but its frozen amount CAN be
 * reconciled against its own movements by `syncAmount` — which DOES cascade,
 * updating the payment movement and the account's credit pool to match. */
export class PaidState implements CreditStatementState {
  readonly name = "PAID" as const;

  canClose(): boolean {
    return false;
  }

  canPay(): boolean {
    return false;
  }
}
