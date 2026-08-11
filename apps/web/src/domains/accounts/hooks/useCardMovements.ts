import { useTransactions, useTransactionsSummary } from "../../transactions/hooks/useTransactions";

/** How many recent movements a card's detail surface lists. */
export const RECENT_LIMIT = 4;

/**
 * The two card-scoped movement queries, in one place.
 *
 * Shared by `CardDetailPanel` and by `CardDetailSurface`, which renders the card
 * TILE above that panel and needs the same loading state to show it as part of
 * the same block. Calling this hook twice costs nothing: identical query keys, so
 * react-query serves both callers from one request.
 *
 * `recent: false` (the inline variant, which doesn't list them) skips the
 * recent-rows request entirely — passing no filters would ask for the user's
 * ENTIRE history instead.
 */
export function useCardMovements(
  accountId: string,
  cardId: string,
  options?: { enabled?: boolean; recent?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const wantsRecent = enabled && (options?.recent ?? true);
  const filters = { bankAccountId: accountId, cardId };
  const summaryQuery = useTransactionsSummary(filters, { enabled });
  const recentQuery = useTransactions(
    { ...filters, limit: RECENT_LIMIT },
    { enabled: wantsRecent },
  );

  return {
    summary: summaryQuery.data,
    recent: recentQuery.data,
    summaryLoading: enabled && summaryQuery.isLoading,
    // A disabled query stays `isLoading` forever — it never runs — so it must not
    // count towards a "still loading" flag that gates rendering.
    loading: (enabled && summaryQuery.isLoading) || (wantsRecent && recentQuery.isLoading),
  };
}
