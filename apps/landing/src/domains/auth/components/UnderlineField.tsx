import { CalendarDays, Check, Eye, EyeOff } from "lucide-react";
import { type HTMLAttributes, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { DateField } from "@finance/ui/src/shared/ui/date-field";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  max?: string;
  /** A date with nothing picked opens its calendar on this month (`yyyy-mm-dd`). */
  defaultMonth?: string;
  /** Validation message, shown under the line (which turns red). May carry an action (a link). */
  error?: ReactNode;
  /** Draws a check at the end of the line — the value passed its own validation (a RUT's
   * check digit), so the user knows before submitting. */
  valid?: boolean;
  /** Digits line up (RUT, dates). */
  numeric?: boolean;
  /** The control itself (the input, or a date's calendar button), so a form can move focus to
   * its first invalid field. */
  ref?: (el: HTMLElement | null) => void;
}

/**
 * The access panel's field: label above, a large value on a single underline, no box. Lighter
 * than the app's label/value rows on purpose — the access forms are short and are the first
 * thing a new user types into. A password gets its own show/hide toggle, and a date the app's own
 * calendar (`DateField`) instead of the browser's, which ignores the theme and reads "dd-mm-aaaa".
 */
export function UnderlineField({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  autoComplete = "off",
  autoFocus,
  inputMode,
  max,
  defaultMonth,
  error,
  valid,
  numeric,
  ref,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const RevealIcon = revealed ? EyeOff : Eye;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2 border-b-[1.5px] pb-2 pt-1.5 transition-colors focus-within:border-primary",
          error ? "border-destructive focus-within:border-destructive" : "border-input",
        )}
      >
        {type === "date" ? (
          <DateField
            id={id}
            ref={ref}
            variant="bare"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            max={max}
            placeholder={placeholder}
            openTo="years"
            defaultMonth={defaultMonth}
            todayShortcut={false}
            icon={CalendarDays}
            invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        ) : (
          <input
            ref={ref}
            id={id}
            type={isPassword && revealed ? "text" : type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            inputMode={inputMode}
            max={max}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-medium sm:text-sm text-foreground outline-none placeholder:font-normal placeholder:text-dim",
              numeric && "tabular-nums",
            )}
          />
        )}
        {valid && !error ? (
          <Check className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
        ) : null}
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? t("common.hidePassword") : t("common.showPassword")}
            aria-pressed={revealed}
            className="-my-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RevealIcon className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
