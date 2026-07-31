import type { CreditStatementState } from "./credit-statement-state";

/** Frozen at pay time — can never be paid again, but its frozen amount CAN be
 * manually corrected (no cascade to the linked payment transaction or to the
 * account's `creditUsed` — a deliberate simplification for personal use). */
export class PaidState implements CreditStatementState {
  readonly name = "PAID" as const;

  canClose(): boolean {
    return false;
  }

  canPay(): boolean {
    return false;
  }

  canCorrectAmount(): boolean {
    return true;
  }
}
