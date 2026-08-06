import { useCallback, useSyncExternalStore } from "react";

import { minWidth } from "../../../breakpoints";

/**
 * Subscribes to a CSS media query from JS. Only for cases a Tailwind responsive
 * class can't cover — when the *structure* changes, not just the styling (e.g. a
 * tab that exists on mobile and doesn't on desktop). Prefer `lg:` utilities
 * otherwise.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = globalThis.matchMedia?.(query);
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => globalThis.matchMedia?.(query).matches ?? false, [query]);
  // Server snapshot: no viewport to measure, so assume the mobile layout.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Desktop stage (`2xl`). Kept for views whose layout genuinely depends on the
 * VIEWPORT; a two-column decision that the collapsible sidebar can change should
 * measure its own width instead — see `useElementWidth`/`ASIDE_MIN_WIDTH`. */
export const DESKTOP_QUERY = minWidth("2xl");
