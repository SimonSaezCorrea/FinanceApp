import type { CreditStatement } from "../credit-statement.aggregate";

export const CREDIT_STATEMENT_REPOSITORY = Symbol("CREDIT_STATEMENT_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. */
export interface CreditStatementRepositoryPort {
  findById(userId: string, accountId: string, statementId: string): Promise<CreditStatement | null>;
  /** The account's currently OPEN period (`closedAt: null`), if any. */
  findOpenForAccount(accountId: string): Promise<CreditStatement | null>;
  listForAccount(userId: string, accountId: string): Promise<CreditStatement[]>;
  save(aggregate: CreditStatement): Promise<void>;
  saveWithTx(tx: unknown, aggregate: CreditStatement): Promise<void>;
  /** Live sum (Σexpense − Σincome) of every transaction currently linked to
   * this statement — the displayed `amount` while unpaid. */
  sumLinkedTransactions(statementId: string): Promise<string>;
}
