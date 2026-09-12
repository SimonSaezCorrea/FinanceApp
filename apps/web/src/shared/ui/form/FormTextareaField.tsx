import { Pencil } from "lucide-react";

import { cn } from "../../lib/cn";
import { Textarea } from "../textarea";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Trailing pencil icon beside the label, always visible — same affordance
   * as `FormTextField`'s, for a filled note in edit mode. Opt-in. */
  showEditIcon?: boolean;
  className?: string;
}

/**
 * A note is a paragraph, not a value that fits a label/value row — label
 * above, a full-width plain textarea below (no border/background of its own),
 * instead of cramming free text into the compact right-aligned chip every
 * other field uses.
 */
export function FormTextareaField({
  label,
  value,
  onChange,
  id,
  placeholder,
  rows,
  disabled,
  showEditIcon = false,
  className,
}: Readonly<Props>) {
  return (
    <div className={className ?? "flex flex-col gap-1.5 border-t border-border pt-4"}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm text-muted-foreground">
          {label}
        </label>
        {showEditIcon ? (
          <Pencil
            aria-hidden
            className={cn("size-3.5 shrink-0 text-muted-foreground", disabled && "opacity-60")}
          />
        ) : null}
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="border-0 bg-transparent p-0 shadow-none focus-visible:outline-none focus-visible:ring-0"
      />
    </div>
  );
}
