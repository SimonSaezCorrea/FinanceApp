export const TRANSACTION_WRITER_REPOSITORY = Symbol("TRANSACTION_WRITER_REPOSITORY");

/** A movement another domain needs to record as part of its own atomic action. */
export interface TransactionPlan {
  id: string;
  userId: string;
  bankAccountId: string | null;
  type: "INCOME" | "EXPENSE";
  /** moneyString */
  amount: string;
  currency: string;
  occurredAt: Date;
  category: string | null;
  description: string | null;
}

/**
 * Write port over the `transaction` table for the domains that must create
 * movements they don't own: `credit-statement` (paying a statement creates a real
 * EXPENSE inside its own Prisma transaction) and `import` (bulk insert). Keeps
 * both from touching `prisma.transaction` themselves — one table, one adapter.
 */
export interface TransactionWriterRepositoryPort {
  createWithTx(tx: unknown, plan: TransactionPlan): Promise<void>;
  /** Bulk insert, used by the `import` domain (a spreadsheet/statement import
   * creates many movements at once, with no credit-pool effect). */
  createMany(rows: Omit<TransactionPlan, "id">[]): Promise<number>;
}
