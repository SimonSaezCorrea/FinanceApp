import type { CreditStatement } from "../credit-statement.aggregate";

export const CREDIT_STATEMENT_REPOSITORY = Symbol("CREDIT_STATEMENT_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface CreditStatementRepositoryPort {
  findById(userId: string, accountId: string, statementId: string): Promise<CreditStatement | null>;
  /** The account's currently OPEN period (`closedAt: null`), if any. */
  findOpenForAccount(accountId: string): Promise<CreditStatement | null>;
  listForAccount(userId: string, accountId: string): Promise<CreditStatement[]>;
  /** The account's OPEN period, created lazily if none exists — called by the
   * `transaction` domain when a contributing movement is recorded.
   * `fallbackPeriodStart` (the account's own `createdAt`) is only used for the
   * very first period, when no earlier statement has been closed yet; the caller
   * passes it in because this domain must not read the `bank-account` table. */
  findOrCreateOpenForAccount(accountId: string, fallbackPeriodStart: Date): Promise<{ id: string }>;
  /**
   * The period that receives a settled period's shortfall: the account's OPEN
   * one, or a fresh one starting where the settled period closed.
   *
   * `excludeStatementId` is the period being paid — paying an OPEN period closes
   * it, but that `closedAt` is only written later in the same transaction, so
   * without this it would find itself and carry its own leftover onto itself.
   */
  findOrCreateCarryOverTargetWithTx(
    tx: unknown,
    params: { accountId: string; excludeStatementId: string; periodStart: Date },
  ): Promise<{ id: string }>;
  /** Adds to a period's `carriedOverAmount` (never overwrites: two periods in a
   * row can each roll their shortfall into the same open one). */
  addCarriedOverWithTx(tx: unknown, statementId: string, amount: string): Promise<void>;
  /** Whether a statement is already PAID — governs the "never touch `creditUsed`
   * again for a movement whose period is settled" edit/delete rule. */
  isPaid(statementId: string): Promise<boolean>;
  save(aggregate: CreditStatement): Promise<void>;
  saveWithTx(tx: unknown, aggregate: CreditStatement): Promise<void>;
  /** Live sum (Σexpense − Σincome) of every transaction currently linked to
   * this statement — the displayed `amount` while unpaid. */
  sumLinkedTransactions(statementId: string): Promise<string>;
  /** What the period is made of (purchases vs installment charges). */
  breakdown(
    statementId: string,
  ): Promise<{ purchases: string; installments: string; installmentCount: number }>;
}
