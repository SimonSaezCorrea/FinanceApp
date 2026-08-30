import { useCallback, useEffect, useState } from "react";

/**
 * Observed width of an element, in px (`null` until first measured), plus the ref
 * to put on it: `const [ref, width] = useElementWidth()`.
 *
 * For layouts that must respond to the space they actually got rather than to the
 * viewport: the same 1024px screen gives a table ~160px less room when the
 * sidebar is expanded, and a viewport media query can't see that difference. Use
 * a Tailwind breakpoint whenever the viewport IS the question; use this when a
 * sibling can change the available width.
 *
 * The ref is a CALLBACK ref held in state, not a `useRef` object, so the effect
 * re-runs the moment the node actually enters the DOM. With a `useRef` the effect
 * ran once on mount and gave up if the element wasn't there yet — which is exactly
 * what happens behind a `if (isLoading) return <LoadingState/>` early return: the
 * width stayed `null` forever and the view was stuck on its narrow layout until
 * something remounted it (e.g. revisiting with a warm query cache).
 */
export function useElementWidth(): [(el: HTMLElement | null) => void, number | null] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  // Seed the width in the ref callback itself, not in the effect: waiting for the
  // observer's first callback would render one frame with the fallback layout and
  // then swap it, and doing it inside the effect is a cascading render.
  const ref = useCallback((el: HTMLElement | null) => {
    setElement(el);
    if (el) setWidth(el.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, width];
}

/**
 * Width a record view needs before it can afford a second column beside its main
 * content (the account detail's cards aside). Measured on the VIEW: at a 1280px
 * viewport the shell gets ~1152px with the sidebar collapsed (aside fits) and
 * ~992px with it expanded (cards move into their own tab instead) — the same
 * screen, two different answers, which is why this can't be a breakpoint.
 */
export const ASIDE_MIN_WIDTH = 1100;

/**
 * Width a row-based table needs before its per-column desktop layout still
 * fits, below which it collapses to the stacked compact list. ONE value for
 * every such table in the app (Movimientos, Cuotas, Facturación) — they used
 * to disagree (860/860/640px of container), which is what let their compact
 * layouts drift into three different shapes instead of one shared row format.
 */
export const TABLE_ROW_MIN_WIDTH = 760;
