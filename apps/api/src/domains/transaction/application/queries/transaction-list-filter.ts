import type { transactions } from "@finance/contracts";

import type { TransactionListFilter } from "../../domain/ports/transaction.repository.port";

/**
 * Contract filters -> the port's pre-parsed filter shape. Shared by the list
 * and summary handlers on purpose: the summary describes the very set the list
 * pages through, so any divergence here would show up as KPIs that don't match
 * the rows on screen.
 *
 * `limit`/`cursor` are deliberately NOT part of this — they select a page, they
 * don't narrow the set being summarized.
 */
export function toListFilter(filters: transactions.TransactionFilters): TransactionListFilter {
  return {
    type: filters.type,
    bankAccountId: filters.bankAccountId,
    cardId: filters.cardId,
    category: filters.category,
    occurredFrom: filters.from ? new Date(filters.from) : undefined,
    occurredTo: filters.to ? new Date(filters.to) : undefined,
  };
}
