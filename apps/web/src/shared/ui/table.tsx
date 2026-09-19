import { forwardRef } from "react";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../lib/cn";

/**
 * `scrollRef` (optional) forwards to the actual `overflow-x-auto` wrapper — the
 * element whose `scrollWidth` vs `clientWidth` tells you whether this table is
 * genuinely scrolling horizontally right now. A caller that instead measures an
 * ANCESTOR of this component (e.g. its own outer container) will never see an
 * overflow: that ancestor's child here is capped at `w-full` and absorbs the
 * overflow internally via its own scrollbar, so the ancestor's own box never
 * grows past its assigned width — this bit a responsive table that measured its
 * own outer wrapper expecting to detect overflow there.
 */
export const Table = forwardRef<HTMLDivElement, HTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  scrollRef,
) {
  return (
    <div ref={scrollRef} className="scrollbar-thin w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
});

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("text-muted-foreground", className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b last:border-0", className)} {...props} />;
}

export function TH({
  className,
  numeric,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "px-6 py-3 text-left font-medium",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td className={cn("px-6 py-4", numeric && "text-right tabular-nums", className)} {...props} />
  );
}
