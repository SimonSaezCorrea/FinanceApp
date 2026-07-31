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
  sumByTypeForAccount(userId: string, accountId: string): Promise<{ income: string; expense: string }>;
  /** Movements since `since` on the given accounts — for the balance-series read model. */
  windowForAccounts(
    userId: string,
    accountIds: string[],
    since: Date,
  ): Promise<{ bankAccountId: string | null; type: "INCOME" | "EXPENSE"; amount: string; occurredAt: Date }[]>;
  /** Σ amount by (card, currency, type), each card optionally scoped to its cycle start. */
  sumsByCard(
    userId: string,
    cards: { id: string; since: Date | null }[],
  ): Promise<{ cardId: string; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[]>;
  /** Σexpense − Σincome of the movements linked to one credit statement. */
  netForStatement(statementId: string): Promise<string>;
}
