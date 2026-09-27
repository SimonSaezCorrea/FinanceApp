/**
 * State pattern (FR-005): one object per `CreditStatement` lifecycle stage,
 * each answering "is this operation valid right now" without the aggregate
 * re-implementing the check itself.
 */
export interface CreditStatementState {
  readonly name: "OPEN" | "PENDING" | "PARTIALLY_PAID" | "PAID" | "TRANSFERRED";
  canClose(): boolean;
  canPay(): boolean;
  /** Spec 019: whether a NEW prepago can be created against this period right
   * now. Only `OpenState` allows it — editing/deleting one already applied is a
   * separate, un-gated operation (`CreditStatement.changePrepayment`). */
  canPrepay(): boolean;
  /** Spec 028: whether this period can be transferred to the account's currency.
   * Only `PendingState` (closed, unsettled) — the currency and due-date parts of the
   * rule are the caller's (`accounts.canTransferStatement`). */
  canTransfer(): boolean;
}
