import type { transactions } from "@finance/contracts";

import type { ScopeWhere } from "../scope-where";
import type { TransactionListFilter } from "./transaction.repository.port";

export const TRANSACTION_SCOPE_LOOKUP = Symbol("TRANSACTION_SCOPE_LOOKUP");

/** The facts about a movement a custom field (specs/036) looks at: its scope, and —
 * for "Transferir pendientes" — its amount and currency. */
export interface MovementFacts {
  id: string;
  type: transactions.TransactionType;
  transferGroupId: string | null;
  bankAccountId: string | null;
  cardId: string | null;
  currency: string;
  amount: string;
}

/**
 * Narrow read port over the `transaction` table for the `custom-field` domain
 * (specs/036): counting and listing the movements a scope or a filter covers, and
 * the facts of chosen movements. Exported from the leaf data module so
 * `custom-field` never pulls in this table's orchestration. Every query is scoped by
 * `userId`: a foreign id simply isn't returned.
 */
export interface TransactionScopeLookupPort {
  countInScope(userId: string, scope: ScopeWhere): Promise<number>;
  /** At most `limit` ids, newest first. */
  idsInScope(userId: string, scope: ScopeWhere, limit: number): Promise<string[]>;
  /** Ids of a Movimientos filter's movements, at most `limit`. */
  idsForFilter(userId: string, filter: TransactionListFilter, limit: number): Promise<string[]>;
  factsFor(userId: string, ids: string[], tx?: unknown): Promise<MovementFacts[]>;
}
