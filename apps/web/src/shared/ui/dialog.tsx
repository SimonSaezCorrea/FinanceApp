import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Accessible modal (focus trap, escape, overlay) styled with tokens. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        {/*
          Content (outer) only positions/sizes the dialog — no overflow of its own.
          Radix's focus-trap, dismissable-layer, and body-scroll-lock all gate
          "is this inside the dialog?" on real DOM containment against THIS node.
          A dropdown/popover portaled from inside the dialog (e.g. Combobox) should
          target this node (discoverable via its automatic `role="dialog"`) rather
          than `document.body`, so it's recognized as "inside" by all three.
          The inner div owns `overflow-y-auto` instead of Content itself so that an
          absolutely/fixed-positioned descendant portaled onto Content doesn't get
          counted in the inner scroll area's scrollable-overflow (no double scrollbar).
        */}
        <RadixDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-modal w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "max-h-[90vh] focus:outline-none",
            className,
          )}
        >
          <div className="scrollbar-thin flex max-h-[90vh] flex-col overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <RadixDialog.Title className="text-xl font-semibold tracking-tight">
                  {title}
                </RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <RadixDialog.Close
                className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </RadixDialog.Close>
            </div>
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
