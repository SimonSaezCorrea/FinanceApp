import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "../lib/cn";
import { Card } from "./card";

interface CollapsibleSectionProps {
  title: ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode — pass with `onOpenChange` when something outside the header
   * has to expand the section. Omit for the usual self-managed behavior. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

/** A `Card` with a clickable header that expands/collapses its content. Closed by default. */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
}: Readonly<CollapsibleSectionProps>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  function toggle() {
    const next = !open;
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      {/* The whole header bar is the hit area (not just the title text) — clicking
          anywhere in this row, including its own padding, toggles the section. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-5 text-left text-sm font-semibold"
      >
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </Card>
  );
}
