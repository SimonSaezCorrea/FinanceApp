import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { transactions as contract } from "@finance/contracts";
import type { transactions } from "@finance/contracts";

import { transactionsApi } from "../api/transactionsApi";

/**
 * The whole filtered set in one request, unpaginated. For consumers that
 * aggregate rather than scroll (the dashboard's month view) — a scrolling list
 * wants `useInfiniteTransactions` instead.
 */
export function useTransactions(filters?: transactions.TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters ?? {}],
    queryFn: () => transactionsApi.list(filters),
    // Consumers keep receiving a plain array — the pagination metadata is only
    // of interest to the infinite variant below.
    select: (page) => page.items,
  });
}

/**
 * Movements page by page for the scrolling lists. `filters` deliberately can't
 * carry `cursor`/`limit`: the cursor is this hook's business (threaded from each
 * page's `nextCursor`), and putting it in the key would make every page its own
 * cache entry instead of one growing list.
 */
export function useInfiniteTransactions(
  filters?: Omit<transactions.TransactionFilters, "cursor" | "limit">,
) {
  return useInfiniteQuery({
    queryKey: ["transactions", "infinite", filters ?? {}],
    queryFn: ({ pageParam }) =>
      transactionsApi.list({
        ...filters,
        limit: contract.TRANSACTION_PAGE_SIZE,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/**
 * Count/totals/categories for a filtered set, independent of how many pages are
 * loaded — the KPI strip and the category filter would otherwise only describe
 * the rows already scrolled into view.
 */
export function useTransactionsSummary(
  filters?: Omit<transactions.TransactionFilters, "cursor" | "limit">,
) {
  return useQuery({
    queryKey: ["transactions", "summary", filters ?? {}],
    queryFn: () => transactionsApi.summary(filters),
  });
}
