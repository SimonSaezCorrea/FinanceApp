import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "../../lib/cn";

interface Props {
  /** Already-composed heading, e.g. "Más detalles" + a muted "· opcional" span —
   * left to the caller since the exact translation keys differ per domain. */
  title: ReactNode;
  children: ReactNode;
  className?: string;
  /** Open on mount when the caller already has something to show here (e.g.
   * editing a record that already has a value in one of these fields) —
   * closed otherwise, since this is the optional stuff most records skip. */
  defaultOpen?: boolean;
}

/**
 * A loose group of optional fields (a movement's Emisor/Receptor/Lugar, an
 * account's sobregiro/cupo usado inicial), set apart from the fields every
 * record has by its own bordered, collapsible container — one shared shape so
 * "Más detalles" reads and behaves the same everywhere it appears.
 */
export function FormMoreDetails({
  title,
  children,
  className,
  defaultOpen = false,
}: Readonly<Props>) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="flex flex-col px-3 pb-3">{children}</div> : null}
    </div>
  );
}
