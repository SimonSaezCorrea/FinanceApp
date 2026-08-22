export const INSTALLMENT_PAYMENT_REPOSITORY = Symbol("INSTALLMENT_PAYMENT_REPOSITORY");

/** One scheduled instalment of a plan, as stored. */
export interface InstallmentPaymentRow {
  id: string;
  installmentPlanId: string;
  sequence: number;
  dueDate: Date;
  /** moneyString — the SCHEDULED amount, never rewritten after the plan exists. */
  amount: string;
  /** The REAL date of payment. "Paid" is `paidAt !== null`, NEVER `paidAmount !== null`:
   * a row paid before this feature has a date and no amount. */
  paidAt: Date | null;
  /** moneyString — what was actually paid; null on a legacy row. */
  paidAmount: string | null;
  /** moneyString — inherited from the previous instalment; negative if it was overpaid. */
  carriedOverAmount: string;
  /** The real expense backing this instalment, when there is one. */
  transactionId: string | null;
}

/** A row about to be inserted with its plan (the schedule is computed by the
 * `InstallmentPlan` aggregate and is immutable afterwards). */
export type InstallmentPaymentPlan = { sequence: number; dueDate: Date; amount: string };

/**
 * Port for the `installment-payment` table only (Adapter, FR-011). Not an
 * aggregate root: a payment row exists only inside an `InstallmentPlan`, which
 * owns the rules (schedule generation, immutability, which sequence may be
 * marked paid). This domain owns the table and nothing else.
 */
export interface InstallmentPaymentRepositoryPort {
  listByPlans(planIds: string[]): Promise<InstallmentPaymentRow[]>;
  createForPlan(planId: string, payments: InstallmentPaymentPlan[]): Promise<void>;
  /** Sets/clears one payment's `paidAt`, scoped through its plan's owner. */
  setPaidAt(
    userId: string,
    planId: string,
    sequence: number,
    paidAt: Date | null,
  ): Promise<boolean>;
  /** Writes one instalment's payment state inside a caller-owned transaction. */
  savePaymentStateWithTx(
    tx: unknown,
    planId: string,
    sequence: number,
    state: { paidAt: Date | null; paidAmount: string | null; transactionId: string | null },
  ): Promise<void>;
  /** Applies carry-over deltas to later instalments, same transaction. */
  applyCarryDeltasWithTx(
    tx: unknown,
    planId: string,
    deltas: { sequence: number; delta: string }[],
  ): Promise<void>;
}
