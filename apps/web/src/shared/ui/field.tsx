import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { Label } from "./label";

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** Label + control slot + error message, consistently spaced. */
export function Field({ label, htmlFor, error, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
