import { useCallback, useSyncExternalStore } from "react";

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

/** The `xl` breakpoint — where the account detail switches to its two-column layout. */
export const DESKTOP_QUERY = "(min-width: 1280px)";
