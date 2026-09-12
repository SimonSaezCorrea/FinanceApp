export const CREDIT_STATEMENT_LOOKUP = Symbol("CREDIT_STATEMENT_LOOKUP");

/**
 * A read-only window onto `credit-statement` for domains that own neither the
 * table nor the rules, but must ask it one question before rendering.
 *
 * Today that domain is `transaction`: a movement that IS the payment of a
 * billing period (`CreditStatement.paidTransactionId`) wants to link its own
 * detail view back to that period — but resolving "which statement, on which
 * account, did this transaction pay" is a fact `credit-statement` owns, never
 * a live join `transaction`'s own adapter is allowed to run against a table it
 * doesn't own (Constitution VI).
 */
export interface CreditStatementLookupPort {
  /** For every id in `transactionIds` that is the recorded PAYMENT of some
   * statement, the `{statementId, accountId}` it paid — keyed by the
   * transaction id. Ids that never paid anything are simply absent, not `null`
   * entries, so a page of ordinary movements costs one empty-result query. */
  paymentInfoFor(
    transactionIds: string[],
  ): Promise<Map<string, { statementId: string; accountId: string }>>;
}
