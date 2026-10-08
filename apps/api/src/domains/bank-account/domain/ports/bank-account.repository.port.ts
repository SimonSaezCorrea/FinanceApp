import type { accounts } from "@finance/contracts";

import type { CardPlan } from "../../../card-account/domain/card-account.entity";
import type { BankAccount } from "../bank-account.aggregate";

export const BANK_ACCOUNT_REPOSITORY = Symbol("BANK_ACCOUNT_REPOSITORY");

/** A card the aggregate resolved and the adapter must write, through the
 * `card-account` domain's own port. */
export type CreateCardPlan = CardPlan;

export type CreateAccountPlan = {
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  currency: string;
  institution: string | null;
  institutionId: string | null;
  accountNumber: string | null | undefined;
  accountAlias: string | null;
  initialBalance: string;
  overdraftLimit: string;
  balanceCeiling: string | null;
  creditLimit: string;
  creditUsedInitial: string;
  billingCycleDay: number | null;
  billingCycleType?: accounts.BillingCycleType;
  paymentMethod: accounts.BillingPaymentMethod;
  paymentDueDay?: number | null;
  paymentDueCycleType?: accounts.BillingCycleType;
  cards: CreateCardPlan[];
};

/**
 * Domain-owned port for the `bank-account` table (Adapter, FR-011) — zero
 * Prisma imports, named operations only.
 *
 * Reads return a fully hydrated `BankAccount` (its cards, their limits and its
 * billing settings): the adapter composes the `card-account`, `card-limit` and
 * `billing-settings` domains' own ports to get them, because each table has
 * exactly one adapter allowed to query it. Writes of those child rows likewise
 * travel through their own ports — but always via this aggregate, which is what
 * validates them (a card can never be written around its account's invariants).
 *
 * Sums over the `transaction` table (balance reconciliation, balance series, a
 * card's own usage) are NOT here: they belong to that table's own domain and are
 * consumed through `TransactionSumsRepositoryPort`.
 */
export interface BankAccountRepositoryPort {
  findById(userId: string, id: string): Promise<BankAccount | null>;
  listByUser(userId: string, where: { status?: accounts.AccountStatus }): Promise<BankAccount[]>;
  /** How many accounts of a type the user holds — the cash one is guaranteed to
   * exist, so removing the last of them is refused. */
  countByType(userId: string, type: accounts.AccountType): Promise<number>;
  institutionName(id: string): Promise<string | null>;
  /** ISO alpha-2 of the institution's country — decides the account-number format. */
  institutionCountry(id: string): Promise<string | null>;
  createWithCards(userId: string, plan: CreateAccountPlan): Promise<BankAccount>;
  /** Same write, inside the caller's transaction (cards, their limits and the
   * billing settings too). Returns the new ids, the cards in the plan's order. */
  createWithCardsWithTx(
    tx: unknown,
    userId: string,
    plan: CreateAccountPlan & { minimumPaymentPercent?: string | null },
  ): Promise<{ id: string; cardIds: string[] }>;
  /** Sets the status inside the caller's transaction. */
  setStatusWithTx(tx: unknown, accountId: string, status: accounts.AccountStatus): Promise<void>;
  /** Persists the account's own scalar fields + its billing settings (never its
   * cards — those go through addCard/updateCard/removeCard so existing
   * transaction links to a card are never disturbed by an unrelated save). */
  save(aggregate: BankAccount): Promise<void>;
  saveWithTx(tx: unknown, aggregate: BankAccount): Promise<void>;
  /** Relative adjustment of the shared credit pool inside a caller-provided
   * Prisma transaction — used by the `transaction` domain, whose movements
   * increment/decrement the pool as part of their own atomic write. Kept as a
   * named increment (not a full aggregate save) so two concurrent movements on
   * the same account can't clobber each other's total. */
  incrementCreditUsedWithTx(tx: unknown, accountId: string, delta: string): Promise<void>;
  /** Move an account's reconciled cash balance by `delta` (signed), enlisted in
   * the caller's transaction. Every movement keeps this in step, so the balance
   * is never a figure waiting for someone to press "reconcile". */
  incrementBalanceWithTx(tx: unknown, accountId: string, delta: string): Promise<void>;
  /** Move the account's OPENING figures — `initialBalance` and
   * `creditUsedInitial` — by signed deltas, leaving `currentBalance`/`creditUsed`
   * alone. Used when imported history is already part of today's balance: the
   * opening moves back by what the history adds, so `currentBalance =
   * initialBalance + Σ movements` still holds and today's figure doesn't change. */
  adjustOpeningWithTx(
    tx: unknown,
    accountId: string,
    balanceDelta: string,
    creditDelta: string,
  ): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  /** Same as `remove`, inside the caller's transaction. The row lock the DELETE
   * takes is what serialises two concurrent deletions of the same account: the
   * second finds nothing to delete and must roll back. */
  removeWithTx(tx: unknown, userId: string, id: string): Promise<boolean>;
  addCard(userId: string, accountId: string, plan: CreateCardPlan): Promise<BankAccount>;
  updateCard(
    userId: string,
    accountId: string,
    cardId: string,
    plan: CreateCardPlan,
  ): Promise<BankAccount | null>;
  removeCard(userId: string, accountId: string, cardId: string): Promise<boolean>;
  /** How many rows of this table the user has: what replacing everything from a
   * template (specs/027, REPLACE) would delete, shown before confirming. */
  countForUser(userId: string): Promise<number>;
  /** Deletes every row of this table the user owns, inside the caller's
   * transaction: replacing everything from a template rebuilds them from the file. */
  deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void>;
}
