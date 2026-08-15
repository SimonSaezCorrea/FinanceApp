export const TRANSACTION_SUMS_REPOSITORY = Symbol("TRANSACTION_SUMS_REPOSITORY");

/**
 * Read-only aggregation port over the `transaction` table, for the domains that
 * need sums of movements they don't own: `bank-account` (balance reconciliation,
 * balance series, a card's own used amount) and `credit-statement` (a period's
 * live amount). Those domains must never touch `prisma.transaction` themselves —
 * one table, one adapter.
 */
export interface TransactionSumsRepositoryPort {
  /** Σ amount by type, scoped to user+account — for `reconcileBalance`. */
  sumByTypeForAccount(
    userId: string,
    accountId: string,
  ): Promise<{ income: string; expense: string }>;
  /** Movements since `since` on the given accounts — for the balance-series read model. */
  windowForAccounts(
    userId: string,
    accountIds: string[],
    since: Date,
  ): Promise<
    { bankAccountId: string | null; type: "INCOME" | "EXPENSE"; amount: string; occurredAt: Date }[]
  >;
  /** Σ amount by (card, currency, type), each card optionally scoped to its cycle start. */
  sumsByCard(
    userId: string,
    cards: { id: string; since: Date | null }[],
  ): Promise<{ cardId: string; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[]>;
  /** Σexpense − Σincome of the movements linked to one credit statement. */
  netForStatement(statementId: string): Promise<string>;
  /**
   * Σexpense − Σincome of the movements that fall inside a billing period's DATE
   * WINDOW, regardless of which statement they were linked to when created.
   *
   * This is what reconciliation compares against: movements are linked to
   * whichever period was open at creation time and never re-linked by date, so a
   * movement back-dated into a closed period sits in the wrong one until a sync
   * puts it right. `cardIds: null` means "every movement on the account" (a
   * standalone CREDIT_CARD, where all of them are credit-line movements by
   * construction); otherwise only EXPENSE through those cards counts, the same
   * rule the live credit-pool sums use.
   */
  netForPeriod(input: {
    accountId: string;
    cardIds: string[] | null;
    from: Date;
    to: Date;
  }): Promise<string>;
  /** What a statement is MADE OF: its linked expenses split into ordinary
   * purchases and installment charges (those carrying an `installmentPlanId`),
   * plus how many of the latter there are. Income (payments) is excluded — it
   * reduces the total but isn't part of what was spent. */
  breakdownForStatement(
    statementId: string,
  ): Promise<{ purchases: string; installments: string; installmentCount: number }>;
}
