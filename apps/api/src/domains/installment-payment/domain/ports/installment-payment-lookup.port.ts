export const INSTALLMENT_PAYMENT_LOOKUP = Symbol("INSTALLMENT_PAYMENT_LOOKUP");

/**
 * A read-only window onto `installment-payment` for domains that own neither the
 * table nor the rules, but must ask it one question before acting.
 *
 * Today that domain is `transaction`: a movement backing an instalment cannot be
 * edited or deleted from the Movements view (FR-028a), because its amount is the
 * instalment's payment and changing it there would leave the plan's figures lying.
 * The way to change it is to undo and re-pay the instalment.
 *
 * Deliberately a second, narrow port over the same table rather than a method on
 * `InstallmentPaymentRepositoryPort`: `transaction` gets the one question it needs
 * and no write capability at all — the same split `transaction` itself already
 * exposes between its repository, sums and writer ports.
 */
export interface InstallmentPaymentLookupPort {
  /** Whether this movement is the recorded payment of one of the user's instalments. */
  isLinkedToPayment(userId: string, transactionId: string): Promise<boolean>;
}
