import * as RadixDialog from "@radix-ui/react-dialog";

import { cn } from "../../lib/cn";
import { type SurfaceContent, SurfaceChrome } from "./chrome";

export interface DrawerProps extends SurfaceContent {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `compact` is for a panel opened FROM another panel: narrower, so the one
   * underneath stays partly visible and the stack reads as a stack rather than
   * as a replacement. It also matches the smaller job — a nested panel is a
   * sub-task, not a whole screen.
   */
  size?: "default" | "compact";
  /**
   * True when this panel was opened FROM another still-open panel — elevates
   * its z-index (overlay + content) to outrank the parent regardless of
   * width, and is what stops Radix's dismissable layer from reading the
   * parent as "outside" the newly-opened one. Defaults to `size === "compact"`
   * for the common case (a nested panel is usually also narrower), but a
   * nested panel can stay full width instead — width and stacking are
   * independent questions.
   */
  nested?: boolean;
  className?: string;
}

/**
 * Side panel anchored to the right edge, full height, taking a bit under two
 * thirds of the width.
 *
 * The middle form of an overlay, for a tablet: there IS room to keep the list
 * behind it in view (which a full-screen window would throw away), but not
 * enough to keep that list usable — hence the panel plus a dimmed backdrop,
 * rather than a centered card floating over content that still looks live.
 *
 * Same chrome as every other surface, so only the shell differs: the content
 * doesn't know whether it was opened as a modal, a window or a drawer.
 */
export function Drawer({
  open,
  onOpenChange,
  size = "default",
  nested,
  className,
  ...content
}: Readonly<DrawerProps>) {
  // `compact` panels are nested by default (the common case); a nested panel
  // can also opt to stay full width via `nested` on its own.
  const isNested = nested ?? size === "compact";
  // Inline, not a class: a nested panel has to outrank the one it was opened
  // FROM (z-modal, 1300), and a Tailwind token for it lives in the config — which
  // only recompiles when the dev server restarts. A stacked panel silently
  // rendering behind its parent is too quiet a failure to leave to that.
  const layer = isNested ? { overlay: 1350, content: 1360 } : undefined;
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          style={layer && { zIndex: layer.overlay }}
          className={cn(
            "fixed inset-0 bg-black/50 backdrop-blur-md",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out",
            // z-index, not DOM order, decides what covers what: a nested panel's
            // backdrop has to outrank the panel it was opened from.
            "z-overlay",
          )}
        />
        <RadixDialog.Content
          style={layer && { zIndex: layer.content }}
          className={cn(
            "fixed inset-y-0 right-0 min-w-[320px] focus:outline-none",
            "z-modal",
            size === "compact" ? "w-[42%] max-w-md" : "w-[62%] max-w-2xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
            className,
          )}
        >
          <SurfaceChrome
            {...content}
            variant="window"
            closePlacement="end"
            className="border-l border-border"
            Title={RadixDialog.Title}
            Description={RadixDialog.Description}
            Close={RadixDialog.Close}
          />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
