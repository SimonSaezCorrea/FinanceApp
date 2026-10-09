import { Eye, EyeOff, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { DetailRow } from "../detail-row";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Defaults to "text" — pass "email"/"password"/"tel" etc. for the browser's own
   * keyboard/masking/validation behavior (a password row still needs real masking even
   * though it reads as plain text everywhere else in this row format). */
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
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
  /** Fires when the field loses focus — how a form marks a field "touched" so its
   * validation error shows once the user leaves it, not on the first keystroke. */
  onBlur?: () => void;
  autoFocus?: boolean;
}

/** Label/value row for a single line of free text — reads as plain text until
 * focused, the same borderless right-aligned field every form's optional
 * detail rows (Nota, Emisor, Receptor…) already build by hand. */
export function FormTextField({
  label,
  value,
  onChange,
  id,
  type = "text",
  placeholder,
  disabled,
  required,
  minLength,
  error,
  hint,
  showEditIcon = false,
  className,
  autoComplete = "off",
  onBlur,
  autoFocus,
}: Readonly<Props>) {
  const { t } = useTranslation();
  // A password row gets a show/hide toggle: in this borderless row format a mistyped
  // password is otherwise invisible until the server rejects it.
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const RevealIcon = revealed ? EyeOff : Eye;
  const input = (
    <>
      <input
        id={id}
        type={isPassword && revealed ? "text" : type}
        value={value}
        disabled={disabled}
        required={required}
        minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        placeholder={placeholder}
        aria-label={label}
        autoComplete={autoComplete}
        className={cn(
          "h-8 min-w-0 max-w-[13rem] border-0 bg-transparent p-0 text-right text-sm font-medium text-foreground placeholder:text-muted-foreground shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60",
          showEditIcon || isPassword ? "flex-1" : "w-full",
        )}
      />
      {isPassword ? (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? t("common.hidePassword") : t("common.showPassword")}
          aria-pressed={revealed}
          disabled={disabled}
          className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RevealIcon className="size-4" aria-hidden />
        </button>
      ) : null}
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
