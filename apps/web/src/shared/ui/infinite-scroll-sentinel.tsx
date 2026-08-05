import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Loader2 } from "lucide-react";

interface Props {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  /** Distance below the viewport at which loading starts, so the next page is
   * usually already in place by the time the user reaches the end. */
  rootMargin?: string;
}

/**
 * Bottom-of-list marker that requests the next page as it approaches the
 * viewport — the "load more" affordance without a button.
 *
 * The default `root` (the viewport) is correct even for a list inside its own
 * `overflow-y-auto` column: clipping propagates, so a row scrolled out of that
 * column doesn't intersect the viewport either.
 */
export function InfiniteScrollSentinel({
  hasMore,
  isLoading,
  onLoadMore,
  rootMargin = "200px",
}: Readonly<Props>) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept in a ref so re-creating the callback each render doesn't tear down and
  // re-arm the observer mid-scroll. Assigned in an effect rather than during
  // render — a ref write during render is not allowed.
  const loadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);
  const { t } = useTranslation();

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `isLoading` re-arms the observer after a page lands: if the sentinel is
    // still on screen (a short page on a tall screen) the entry won't fire
    // again on its own, and the list would stop loading halfway.
  }, [hasMore, isLoading, rootMargin]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex items-center justify-center gap-2 py-4" aria-live="polite">
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">{t("app.loadingMore")}</span>
        </>
      ) : (
        // Occupies the same height whether or not a fetch is in flight, so the
        // scroll position doesn't jump as pages arrive.
        <span className="h-4" />
      )}
    </div>
  );
}
