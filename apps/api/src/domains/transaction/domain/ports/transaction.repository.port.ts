import type { transactions } from "@finance/contracts";

import type { Transaction, TransactionProps } from "../transaction.aggregate";

export const TRANSACTION_REPOSITORY = Symbol("TRANSACTION_REPOSITORY");

/** Domain-owned filter shape — mirrors `transactions.TransactionFilters` but
 * pre-shaped for the repository (dates already parsed), so the port never
 * needs to import `@prisma/client`. */
export interface TransactionListFilter {
  type?: transactions.TransactionType;
  bankAccountId?: string;
  cardId?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
}

/**
 * Domain-owned port for the `transaction` table (Adapter, FR-011) — zero Prisma
 * imports, and zero reads of tables it doesn't own: the account/card/limit/
 * statement context a movement is validated against comes from those tables' own
 * ports (`BankAccountRepositoryPort`, `CardAccountRepositoryPort`,
 * `CardLimitRepositoryPort`, `CreditStatementRepositoryPort`), injected straight
 * into the handlers.
 */
export interface TransactionRepositoryPort {
  list(userId: string, where: TransactionListFilter): Promise<Transaction[]>;
  findOne(userId: string, id: string): Promise<Transaction | null>;
  /** Σ income/expense for one card in one currency, optionally scoped to a
   * billing cycle (`since`) and excluding one tx (for edits). */
  sumsForCard(
    userId: string,
    cardId: string,
    currency: string,
    since: Date | null,
    excludeTxId?: string,
  ): Promise<{ income: string; expense: string }>;

  /** Cross-aggregate persistence (FR-020): saves the transaction row +
   * `creditUsed` delta (if any) in one atomic unit. `creditUsedDelta` is
   * `null` when this action doesn't touch the pool. */
  saveNew(
    userId: string,
    plan: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    creditUsedDelta: { accountId: string; delta: string } | null,
  ): Promise<Transaction>;
  saveUpdate(
    userId: string,
    id: string,
    patch: Partial<Omit<TransactionProps, "id" | "userId" | "createdAt" | "updatedAt">> & {
      bankAccountId?: string | null;
      cardId?: string | null;
      creditStatementId?: string | null;
    },
    creditUsedDeltas: { accountId: string; delta: string }[],
  ): Promise<Transaction | null>;
  removeWithCreditAdjustment(
    userId: string,
    id: string,
    creditUsedDelta: { accountId: string; delta: string } | null,
  ): Promise<boolean>;
}
