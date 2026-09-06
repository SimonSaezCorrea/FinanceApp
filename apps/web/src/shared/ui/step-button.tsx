import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/cn";

interface Props {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Small bordered square icon-button — the ‹›/−+ stepper shape shared by
 * `NumberField` and any control that cycles through a short fixed list of
 * values instead of opening a dropdown (e.g. a periodicity picker). */
export function StepButton({ icon: Icon, label, onClick, disabled }: Readonly<Props>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
