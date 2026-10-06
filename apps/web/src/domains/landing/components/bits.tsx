import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/cn";

/** The one type scale every public page's `h1` uses, so moving between pages never changes the
 * size of the headline. `tabIndex={-1}` headings also get no focus ring (focus is programmatic). */
export const HERO_TITLE =
  "text-4xl font-bold leading-[1.04] tracking-tight focus:outline-none sm:text-5xl lg:text-[3.5rem]";

/** Small-caps section label. Use sparingly: at most one per page, and never to repeat the page's
 * own name (the nav already marks it). */
export function Eyebrow({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
