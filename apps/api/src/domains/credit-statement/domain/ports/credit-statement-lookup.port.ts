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

  /** What each account still owes as a CARRIED-OVER shortfall, per currency — keyed
   * `accountId:currency`. A short payment settles its period and moves the rest onto the next
   * one as `carriedOverAmount`, which is not a movement: a card's usage derived from movements
   * would never see it. Summed over every period not settled yet (neither paid nor transferred);
   * accounts/currencies with nothing carried are absent. */
  carriedOverOwed(accountIds: string[]): Promise<Map<string, string>>;

  /** Spec 028 US3: for every id that is the account-currency CHARGE of some transfer
   * (`CreditStatement.transferTransactionId`), the transferred statement's id. Read-only in
   * Movimientos, and linked back to that statement. */
  transferInfoFor(transactionIds: string[]): Promise<Map<string, string>>;
}
