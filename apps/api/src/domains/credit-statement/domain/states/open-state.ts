import type { CreditStatementState } from "./credit-statement-state";

/** Still accumulating — transactions keep linking to it. Closing it is gated
 * further by billing-cycle due-date + eligibility (Strategy), checked by the
 * aggregate's `close()` method before delegating here. Early payment is
 * allowed even while still OPEN. No frozen amount yet, so correcting one
 * makes no sense — edit the linked transactions instead. */
export class OpenState implements CreditStatementState {
  readonly name = "OPEN" as const;

  canClose(): boolean {
    return true;
  }

  canPay(): boolean {
    return true;
  }

  canCorrectAmount(): boolean {
    return false;
  }
}
