import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface PageHeaderProps {
  title: string;
  /** Takes a node so a loading view can reserve the line with a skeleton, which
   *  keeps the header from growing a row when the real subtitle lands. */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    // Stacks on narrow viewports: side by side, the action button squeezes the
    // title until it wraps mid-word (320px).
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
