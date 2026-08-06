import * as RadixDialog from "@radix-ui/react-dialog";

import { cn } from "../../lib/cn";
import { type SurfaceContent, SurfaceChrome } from "./chrome";

export interface DrawerProps extends SurfaceContent {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
export function Drawer({ open, onOpenChange, className, ...content }: Readonly<DrawerProps>) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-overlay bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <RadixDialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-modal w-[62%] min-w-[320px] max-w-2xl focus:outline-none",
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
