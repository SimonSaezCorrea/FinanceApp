import { useEffect, useState } from "react";

/**
 * Observed width of an element, in px (`null` until first measured).
 *
 * For layouts that must respond to the space they actually got rather than to the
 * viewport: the same 1024px screen gives a table ~160px less room when the
 * sidebar is expanded, and a viewport media query can't see that difference. Use
 * a Tailwind breakpoint whenever the viewport IS the question; use this when a
 * sibling can change the available width.
 */
export function useElementWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Seed synchronously: waiting for the observer's first callback would render
    // one frame with the fallback layout and then swap it.
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/**
 * Width a record view needs before it can afford a second column beside its main
 * content (the account detail's cards aside). Measured on the VIEW: at a 1280px
 * viewport the shell gets ~1152px with the sidebar collapsed (aside fits) and
 * ~992px with it expanded (cards move into their own tab instead) — the same
 * screen, two different answers, which is why this can't be a breakpoint.
 */
export const ASIDE_MIN_WIDTH = 1100;
