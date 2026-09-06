import { DetailRow } from "../detail-row";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  decimals?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Label/value row for a plain numeric figure with no stepper — for a number
 * typed once (a rate, a quantity) rather than nudged up/down. Reach for
 * `FormCounterField` instead when ±1 is how the value is actually meant to
 * change (an interval, an instalment count).
 */
export function FormNumberField({
  label,
  value,
  onChange,
  id,
  placeholder,
  decimals = 0,
  disabled,
  className,
}: Readonly<Props>) {
  const pattern = decimals > 0 ? /[^\d.,]/g : /\D/g;
  return (
    <DetailRow label={label} className={className}>
      <input
        id={id}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(pattern, "").replace(",", "."))}
        placeholder={placeholder}
        aria-label={label}
        className="h-8 w-full max-w-[13rem] border-0 bg-transparent p-0 text-right text-sm font-medium tabular-nums text-foreground placeholder:text-muted-foreground shadow-none focus-visible:outline-none focus-visible:ring-0"
      />
    </DetailRow>
  );
}
