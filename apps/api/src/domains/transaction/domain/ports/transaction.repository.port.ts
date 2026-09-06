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
  creditStatementId?: string;
  recurringExpenseId?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  category?: string;
}

/** Decoded keyset cursor — the last row of the previous page. */
export interface TransactionCursor {
  occurredAt: Date;
  id: string;
}

/** `limit`/`cursor` absent ⇒ return every match, `nextCursor: null`. */
export interface TransactionPageRequest {
  limit?: number;
  cursor?: TransactionCursor;
}

export interface TransactionPage {
  items: Transaction[];
  nextCursor: TransactionCursor | null;
}

/** Aggregates over the whole filtered set, not just the requested page. */
export interface TransactionSummaryResult {
  total: number;
  currencyTotals: { currency: string; income: string; expense: string }[];
  categories: string[];
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
  list(
    userId: string,
    where: TransactionListFilter,
    page?: TransactionPageRequest,
  ): Promise<TransactionPage>;
  summary(userId: string, where: TransactionListFilter): Promise<TransactionSummaryResult>;
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

  /** Cross-aggregate persistence (FR-020): saves the transaction row + the
   * `creditUsed` delta (if any) + the affected accounts' cash-balance deltas in
   * one atomic unit. `creditUsedDelta` is `null` when this action doesn't touch
   * the pool; `balanceDeltas` is empty when no account's balance moves (a
   * movement with no account attached). */
  saveNew(
    userId: string,
    plan: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    creditUsedDelta: { accountId: string; delta: string } | null,
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<Transaction>;
  /** Same write, enlisted in the CALLER's transaction. Needed when something
   * outside this table must commit together with the movement — the idempotency
   * record's COMPLETED mark, which has to be atomic with the effect or a crash
   * in between would let a retry duplicate. */
  saveNewWithTx(
    tx: unknown,
    userId: string,
    plan: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    creditUsedDelta: { accountId: string; delta: string } | null,
    balanceDeltas: { accountId: string; delta: string }[],
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
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<Transaction | null>;
  removeWithCreditAdjustment(
    userId: string,
    id: string,
    creditUsedDelta: { accountId: string; delta: string } | null,
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<boolean>;

  /* Transfers — always written as a PAIR, in one `$transaction`, together with
   * both accounts' balance deltas. Never one leg at a time: a half-written
   * transfer is money that vanished. */

  /** Both legs of a transfer, or `null` if the group doesn't exist for the user. */
  findTransferGroup(userId: string, transferGroupId: string): Promise<TransferPair | null>;
  saveTransferPair(
    userId: string,
    outgoing: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    incoming: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<TransferPair>;
  /** Same pair, enlisted in the caller's transaction (see `saveNewWithTx`). */
  saveTransferPairWithTx(
    tx: unknown,
    userId: string,
    outgoing: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    incoming: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<TransferPair>;
  updateTransferPair(
    userId: string,
    transferGroupId: string,
    outgoing: TransferLegPatch,
    incoming: TransferLegPatch,
    /** Reverts of the old legs plus the new legs' effects, already netted. */
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<TransferPair | null>;
  removeTransferPair(
    userId: string,
    transferGroupId: string,
    balanceDeltas: { accountId: string; delta: string }[],
  ): Promise<boolean>;
}

export interface TransferPair {
  transferGroupId: string;
  outgoing: Transaction;
  incoming: Transaction;
}

export type TransferLegPatch = Partial<{
  amount: string;
  currency: string;
  occurredAt: Date;
  category: string | null;
  description: string | null;
  observation: string | null;
  emisor: string | null;
  receptor: string | null;
  lugar: string | null;
  bankAccountId: string;
}>;
