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
    <Card className={cn("p-5", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex-1 text-left text-sm font-semibold"
        >
          {title}
        </button>
        {/* Duplicate of the toggle above, for pointer users who aim at the
            chevron. Hidden from assistive tech on purpose: the labelled button
            beside it already carries the name and `aria-expanded`. */}
        <button type="button" onClick={toggle} aria-hidden tabIndex={-1} className="shrink-0">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {open ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
