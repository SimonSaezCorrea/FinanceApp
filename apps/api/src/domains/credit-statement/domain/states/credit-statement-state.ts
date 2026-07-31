/**
 * State pattern (FR-005): one object per `CreditStatement` lifecycle stage,
 * each answering "is this operation valid right now" without the aggregate
 * re-implementing the check itself.
 */
export interface CreditStatementState {
  readonly name: "OPEN" | "PENDING" | "PAID";
  canClose(): boolean;
  canPay(): boolean;
  canCorrectAmount(): boolean;
}
