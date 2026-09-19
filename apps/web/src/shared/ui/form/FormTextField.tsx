import { Pencil } from "lucide-react";

import { cn } from "../../lib/cn";
import { DetailRow } from "../detail-row";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Shown under the row, e.g. a last-4-digits or expiry validation message —
   * the row format has no room for it inline, so it drops below the divider. */
  error?: string | null;
  /** An explanatory note about the field itself (not a validation error) —
   * shown ABOVE the row's own divider, as part of the same block, so it
   * reads as "this row, plus a note about it" rather than a stray line that
   * fell after the divider. Ignored while `error` is shown. */
  hint?: string | null;
  /** Trailing pencil icon, always visible (not just on focus) — so a filled
   * value in edit mode doesn't read identically to a static DetailRow. Opt-in:
   * most callers of this row are fine without it. */
  showEditIcon?: boolean;
  className?: string;
  /** Passed straight to the input; defaults to "off" since this row's whole
   * point is a short free-text label, not a value the browser should recall
   * or offer autofill suggestions for. */
  autoComplete?: string;
}

/** Label/value row for a single line of free text — reads as plain text until
 * focused, the same borderless right-aligned field every form's optional
 * detail rows (Nota, Emisor, Receptor…) already build by hand. */
export function FormTextField({
  label,
  value,
  onChange,
  id,
  placeholder,
  disabled,
  required,
  error,
  hint,
  showEditIcon = false,
  className,
  autoComplete = "off",
}: Readonly<Props>) {
  const input = (
    <>
      <input
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete={autoComplete}
        className={cn(
          "h-8 min-w-0 max-w-[13rem] border-0 bg-transparent p-0 text-right text-sm font-medium text-foreground placeholder:text-muted-foreground shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60",
          showEditIcon ? "flex-1" : "w-full",
        )}
      />
      {showEditIcon ? (
        <Pencil
          aria-hidden
          className={cn("size-3.5 shrink-0 text-muted-foreground", disabled && "opacity-60")}
        />
      ) : null}
    </>
  );

  if (hint && !error) {
    return (
      <div className={cn("border-b border-border py-3 last:border-b-0", className)}>
        <DetailRow label={label} className="border-b-0 py-0">
          {input}
        </DetailRow>
        <p className="pt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    );
  }

  return (
    <>
      <DetailRow label={label} className={className}>
        {input}
      </DetailRow>
      {error ? (
        <p role="alert" className="pb-2 pt-1 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
