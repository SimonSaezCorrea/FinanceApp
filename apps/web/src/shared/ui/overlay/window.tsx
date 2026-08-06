import * as RadixDialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/cn";
import { type SurfaceContent, SurfaceChrome } from "./chrome";

export interface WindowProps extends SurfaceContent {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/**
 * Full-screen sm: takes the whole viewport, header and footer fixed, one
 * scrolling body. This is the phone form of every overlay — a centered card on a
 * 360px screen wastes most of it and reads as cramped, while a screen that pushed
 * in over the app reads as a place you're in and can back out of.
 */
export function Window({ open, onOpenChange, className, ...content }: Readonly<WindowProps>) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* No visible scrim — the sheet covers everything — but the overlay node
            still has to exist for Radix's dismissable-layer/scroll-lock. */}
        <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-background data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <RadixDialog.Content
          className={cn(
            "fixed inset-0 z-modal focus:outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=open]:fade-in",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-2 data-[state=closed]:fade-out",
            className,
          )}
        >
          <SurfaceChrome
            {...content}
            variant="window"
            Title={RadixDialog.Title}
            Description={RadixDialog.Description}
            Close={RadixDialog.Close}
          />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * The same window frame WITHOUT Radix, for a screen that is a route rather than
 * an overlay (e.g. `/accounts/:id/edit` on a phone): there is nothing to trap
 * focus into and no layer to dismiss, but the chrome should be identical. The
 * caller supplies its own way out through `leading` — typically a back arrow,
 * which on a route also has to guard unsaved changes.
 */
export function WindowScreen({
  className,
  ...content
}: Readonly<SurfaceContent & { className?: string }>) {
  return (
    <div className={cn("fixed inset-0 z-modal bg-background", className)}>
      <SurfaceChrome
        {...content}
        variant="window"
        Title={({ className: c, children }) => <h1 className={c}>{children}</h1>}
      />
    </div>
  );
}
