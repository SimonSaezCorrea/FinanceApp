import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "../lib/cn";

export const Input = forwardRef<HTMLInputElement, Readonly<InputHTMLAttributes<HTMLInputElement>>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          // 16px on phones: iOS Safari zooms into any field under 16px and never zooms back out.
          "h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
