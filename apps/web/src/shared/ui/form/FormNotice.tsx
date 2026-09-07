import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface Props {
  children: ReactNode;
  icon?: LucideIcon;
  /** "muted" (default): a plain informational aside. "warning": the same box
   * tinted for something the user should double check before submitting. */
  tone?: "muted" | "warning";
  className?: string;
}

const TONE_CLASS: Record<"muted" | "warning", { box: string; icon: string }> = {
  muted: {
    box: "border-border bg-background text-muted-foreground",
    icon: "text-muted-foreground",
  },
  warning: { box: "border-warning/40 bg-warning/5 text-warning", icon: "text-warning" },
};

/**
 * The small bordered "by the way" box every create/edit sheet ends up with —
 * a recurring series' "se generará un movimiento…", a debt's schedule note, an
 * instalment plan's frozen-fields explanation. One shape instead of each form
 * rolling its own `rounded-[9.6px] border p-[14px_16px]` div.
 */
export function FormNotice({
  children,
  icon: Icon = Info,
  tone = "muted",
  className,
}: Readonly<Props>) {
  const { box, icon } = TONE_CLASS[tone];
  return (
    <div
      role={tone === "warning" ? "alert" : undefined}
      className={cn("flex gap-2 rounded-[9.6px] border p-[14px_16px] text-[13px]", box, className)}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", icon)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
