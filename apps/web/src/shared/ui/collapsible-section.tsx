import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "../lib/cn";
import { Card } from "./card";

interface CollapsibleSectionProps {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/** A `Card` with a clickable header that expands/collapses its content. Closed by default. */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  className,
}: Readonly<CollapsibleSectionProps>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={cn("p-5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}
