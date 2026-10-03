import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/cn";

/** Small-caps section label. */
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
