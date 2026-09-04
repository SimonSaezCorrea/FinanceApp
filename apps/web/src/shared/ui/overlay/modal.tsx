import * as RadixDialog from "@radix-ui/react-dialog";

import { cn } from "../../lib/cn";
import { type SurfaceContent, SurfaceChrome } from "./chrome";

export interface ModalProps extends SurfaceContent {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sizing for the floating card (defaults to `max-w-2xl`). */
  className?: string;
}

/**
 * Centered floating card, focus-trapped, dismissable with Escape or a click on
 * the backdrop. Use directly when the overlay must stay a modal at every width
 * (an alert, a confirmation); use `ResponsiveSurface` when a phone should get the
 * full screen instead.
 *
 * The backdrop both darkens AND blurs what's behind it: with a translucent-only
 * scrim, text and table rows under a card of the same tone kept competing with
 * the modal's own content — the blur removes the competing detail so the eye
 * lands on the dialog, and it doubles as an unmistakable "this is on top" cue.
 */
export function Modal({ open, onOpenChange, className, ...content }: Readonly<ModalProps>) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/*
          Inline z-index, not a Tailwind token: a Modal is documented to stack ON
          TOP of another open surface (confirming a delete from inside a Drawer
          or Window), whose own content shares z-modal (1300) — so this has to
          outrank it. A new token in the theme config only takes effect after a
          dev-server restart (see Drawer's own `nested` comment below for the same
          gotcha), which would silently leave the confirmation painting behind the
          surface it's meant to interrupt.
        */}
        <RadixDialog.Overlay
          style={{ zIndex: 1450 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out"
        />
        {/*
          Content (outer) only positions/sizes the dialog — no overflow of its own.
          Radix's focus-trap, dismissable-layer and body-scroll-lock all gate "is
          this inside the dialog?" on real DOM containment against THIS node, so a
          dropdown portaled from inside (Combobox, SearchableSelect) targets it via
          its automatic `role="dialog"` rather than `document.body`. The chrome
          owns `overflow-y-auto` instead of Content itself so an absolutely
          positioned descendant portaled onto Content isn't counted in the inner
          scroll area's scrollable overflow (no double scrollbar).
        */}
        <RadixDialog.Content
          style={{ zIndex: 1460 }}
          className={cn(
            "fixed left-1/2 top-1/2 w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "max-h-[90vh] focus:outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95",
            className,
          )}
        >
          <SurfaceChrome
            {...content}
            variant="modal"
            Title={RadixDialog.Title}
            Description={RadixDialog.Description}
            Close={RadixDialog.Close}
          />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
