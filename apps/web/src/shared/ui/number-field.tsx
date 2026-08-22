import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../lib/cn";

interface Props {
  id?: string;
  /** The value as a string, exactly as a form holds it. Empty is a valid state. */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  /** How much the − / + buttons move the value. */
  step?: number;
  /** Digits allowed after the decimal point when typing. 0 = integers only. */
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  /** `inline` (default) is the label/value row control; `control` is a form field. */
  variant?: "inline" | "control";
  className?: string;
  "aria-label"?: string;
}

/**
 * A number input with the app's own stepper instead of the browser's.
 *
 * `<input type="number">` renders the OS spinner arrows: they ignore every token in
 * this app (they came up as a light native widget inside a dark panel), differ per
 * browser, and scroll-wheel over the field silently changes the value. So the field
 * is a plain text input constrained to digits, with two token-styled buttons beside
 * it — the value it exchanges is still a plain string, so callers are unchanged.
 *
 * Clamping happens on the STEPPER, not while typing: correcting a half-typed "1" to
 * the minimum as the user reaches for "12" is the classic way these fields fight back.
 */
export function NumberField({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = 0,
  placeholder,
  disabled = false,
  variant = "inline",
  className,
  "aria-label": ariaLabel,
}: Readonly<Props>) {
  const { t } = useTranslation();

  const pattern = decimals > 0 ? /[^\d.,]/g : /\D/g;

  function handleType(raw: string) {
    const cleaned = raw.replace(pattern, "").replace(",", ".");
    onChange(cleaned);
  }

  function stepBy(delta: number) {
    const current = value.trim() === "" ? (min ?? 0) : Number(value);
    const base = Number.isFinite(current) ? current : (min ?? 0);
    let next = base + delta;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(decimals > 0 ? String(Number(next.toFixed(decimals))) : String(Math.round(next)));
  }

  const numeric = Number(value);
  const atMin = min !== undefined && Number.isFinite(numeric) && numeric <= min;
  const atMax = max !== undefined && Number.isFinite(numeric) && numeric >= max;

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        variant === "control" && "h-10 w-full rounded-md border border-input bg-background px-1",
        className,
      )}
    >
      <StepButton
        icon="minus"
        label={t("common.decrease")}
        onClick={() => stepBy(-step)}
        disabled={disabled || atMin}
      />
      <input
        id={id}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        value={value}
        onChange={(e) => handleType(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "h-8 border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums text-foreground",
          "placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50",
          variant === "control" ? "min-w-0 flex-1" : "w-14",
        )}
      />
      <StepButton
        icon="plus"
        label={t("common.increase")}
        onClick={() => stepBy(step)}
        disabled={disabled || atMax}
      />
    </div>
  );
}

interface StepButtonProps {
  icon: "minus" | "plus";
  label: string;
  onClick: () => void;
  disabled: boolean;
}

function StepButton({ icon, label, onClick, disabled }: Readonly<StepButtonProps>) {
  const Icon = icon === "minus" ? Minus : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
