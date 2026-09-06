import type { ReactNode } from "react";

import { DetailRow } from "../detail-row";
import { NumberField } from "../number-field";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  placeholder?: string;
  /** A trailing unit next to the figure ("mes(es)", "semana(s)") — "Cada 2"
   * alone means nothing. */
  unit?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Label/value row for a ±1-stepped figure — "Repetir cada", "Número de
 * cuotas", an interest rate typed in hundredths. Wraps `NumberField`, the
 * app's own −/+ control (never the browser's native spinner). */
export function FormCounterField({
  label,
  value,
  onChange,
  id,
  min,
  max,
  step,
  decimals,
  placeholder,
  unit,
  disabled,
  className,
}: Readonly<Props>) {
  return (
    <DetailRow label={label} className={className}>
      <span className="flex items-center gap-2">
        <NumberField
          id={id}
          min={min}
          max={max}
          step={step}
          decimals={decimals}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={label}
        />
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </span>
    </DetailRow>
  );
}
