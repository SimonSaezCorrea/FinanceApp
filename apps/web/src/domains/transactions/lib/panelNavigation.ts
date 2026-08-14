export interface PanelNavigationInput {
  /** Index of the open movement inside the loaded set. */
  index: number;
  /** How many movements are loaded right now. */
  loaded: number;
  /** Size of the WHOLE filtered set (from the summary endpoint), if known. */
  total?: number;
  /** Whether another page can still be fetched. */
  hasNextPage: boolean;
}

export interface PanelNavigation {
  /** 1-based position shown as "N de M". */
  position: number;
  /** M — the whole filtered set when known, else what's loaded. */
  count: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  /** Index to open on "next", or `null` when a page has to be fetched first. */
  nextIndex: number | null;
  previousIndex: number | null;
  /** True when "next" must trigger `fetchNextPage()` before it can move. */
  needsMore: boolean;
}

/**
 * Pure paging arithmetic for the detail panel's ‹ › (research D5). The panel
 * never queries anything of its own: it walks the same array the table behind it
 * already holds, and asks the parent for one more page when it runs off the end.
 */
export function panelNavigation({
  index,
  loaded,
  total,
  hasNextPage,
}: PanelNavigationInput): PanelNavigation {
  const atLastLoaded = index >= loaded - 1;
  const needsMore = atLastLoaded && hasNextPage;

  return {
    position: index + 1,
    count: total ?? loaded,
    canGoPrevious: index > 0,
    canGoNext: !atLastLoaded || hasNextPage,
    previousIndex: index > 0 ? index - 1 : null,
    nextIndex: atLastLoaded ? null : index + 1,
    needsMore,
  };
}
