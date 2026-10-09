import type { LabelHTMLAttributes } from "react";

import { cn } from "@finance/ui/src/shared/lib/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}
