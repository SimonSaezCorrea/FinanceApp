import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

import { cn } from "../lib/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  Readonly<TextareaHTMLAttributes<HTMLTextAreaElement>>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
