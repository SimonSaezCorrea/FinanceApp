import type { CreditStatementState } from "./credit-statement-state";

/** Spec 028: a period in another currency that went overdue unpaid and was
 * converted by the bank into a charge on the account-currency period. Terminal,
 * like PAID — the debt now lives in that other period; only undoing the transfer
 * (`CreditStatement.undoTransfer`) brings this one back to PENDING. */
export class TransferredState implements CreditStatementState {
  readonly name = "TRANSFERRED" as const;

  canClose(): boolean {
    return false;
  }

  canPay(): boolean {
    return false;
  }

  canPrepay(): boolean {
    return false;
  }

  canTransfer(): boolean {
    return false;
  }
}
