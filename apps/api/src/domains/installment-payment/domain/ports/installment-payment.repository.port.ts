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
  /** The billing period that charged it (spec 014); null while unbilled. */
  creditStatementId: string | null;
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
  /** Unbilled instalments (`creditStatementId IS NULL`) due at or before `dueBy`,
   * for the given plans — the raw candidate set `installment-billing.ts`'s pure
   * selection filters further (currency). Spec 014, FR-008/FR-009. */
  listUnbilledDueForPlans(planIds: string[], dueBy: Date): Promise<InstallmentPaymentRow[]>;
  /** Stamps a set of instalments with the period that just charged them, inside the
   * caller's transaction. `creditStatementId IS NULL` in the WHERE makes this
   * idempotent by construction — a retry that re-selected an already-stamped row
   * would still update zero of it. */
  stampWithTx(tx: unknown, paymentIds: string[], statementId: string): Promise<void>;
  /** Marks every instalment stamped with this statement as PAID (spec 014, FR-014):
   * any payment — full or short — settles the period, so all of them settle
   * together, at the instalment's own scheduled amount regardless of what the
   * period as a whole received (the shortfall lives in the period's carry-over,
   * never doubled onto the instalment — Constitution I). */
  settleForStatementWithTx(tx: unknown, statementId: string, paidAt: Date): Promise<void>;
  /** What a statement is made of on the instalment side (spec 014, FR-011): the sum
   * and count of the instalments stamped with it. Composed with the ordinary-
   * movement sum by `credit-statement`'s own adapter, never by `transaction`'s —
   * that table owns the movements, not the schedule. */
  sumBilledForStatement(statementId: string): Promise<{ amount: string; count: number }>;
  createForPlan(planId: string, payments: InstallmentPaymentPlan[]): Promise<void>;
  /** Same, inside a transaction the caller owns, returning the rows as written — the
   * caller cannot re-read them through its own client while the transaction is open. */
  createForPlanWithTx(
    tx: unknown,
    planId: string,
    payments: InstallmentPaymentPlan[],
  ): Promise<InstallmentPaymentRow[]>;
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
