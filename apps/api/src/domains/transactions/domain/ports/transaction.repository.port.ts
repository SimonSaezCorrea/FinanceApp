import type { transactions } from "@finance/contracts";

import type { AccountContext, CardContext, CardLimitContext } from "../movement-policy";
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

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface TransactionRepositoryPort {
  list(userId: string, where: TransactionListFilter): Promise<Transaction[]>;
  findOne(userId: string, id: string): Promise<Transaction | null>;

  /** Account context (type + credit pool) for movement rules + enforcement,
   * scoped to the user. */
  findAccount(userId: string, id: string): Promise<AccountContext | null>;
  /** The card (with `kind`) if it's the user's and belongs to this account. */
  findCardInAccount(userId: string, cardId: string, accountId: string): Promise<CardContext | null>;
  /** The card's own sub-limit for a given currency, if one was set. */
  findCardLimit(userId: string, cardId: string, currency: string): Promise<CardLimitContext | null>;
  /** Σ income/expense for one card in one currency, optionally scoped to a
   * billing cycle (`since`) and excluding one tx (for edits). */
  sumsForCard(
    userId: string,
    cardId: string,
    currency: string,
    since: Date | null,
    excludeTxId?: string,
  ): Promise<{ income: string; expense: string }>;

  /** The account's currently OPEN billing period, or creates one — see
   * `accounts`' `CreditStatement` (out of this domain's aggregate scope,
   * touched via a plain id-returning read/write, same as the pre-migration
   * repository did). */
  findOrCreateOpenStatement(accountId: string): Promise<{ id: string }>;
  /** Whether a given statement is already PAID — governs the "don't touch
   * `creditUsed` for transactions linked to an already-settled statement"
   * edit/delete rule. */
  isStatementPaid(statementId: string): Promise<boolean>;

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
