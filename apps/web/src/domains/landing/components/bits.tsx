import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";

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

/** Titled explanatory card — the rule behind a screen, in two lines. */
export function InfoCard({ title, children }: Readonly<{ title: ReactNode; children: ReactNode }>) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </Card>
  );
}

/** A page's own heading block. `h1` is focusable so a route change can move focus to it. */
export function PageIntro({
  title,
  description,
  aside,
}: Readonly<{ title: ReactNode; description?: ReactNode; aside?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/** A thin progress bar over the `track` token. */
export function Bar({
  percent,
  tone = "bg-primary",
  className,
}: Readonly<{ percent: number; tone?: string; className?: string }>) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-track", className)}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
    </div>
  );
}
