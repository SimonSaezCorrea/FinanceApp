export const INSTALLMENT_PAYMENT_REPOSITORY = Symbol("INSTALLMENT_PAYMENT_REPOSITORY");

/** One scheduled instalment of a plan, as stored. */
export interface InstallmentPaymentRow {
  id: string;
  installmentPlanId: string;
  sequence: number;
  dueDate: Date;
  /** moneyString */
  amount: string;
  paidAt: Date | null;
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
}
