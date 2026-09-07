import { CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DateField, type DateValue } from "../date-field";
import { DetailRow } from "../detail-row";

interface Props {
  label: string;
  value: DateValue;
  onChange: (value: DateValue) => void;
  id?: string;
  /** Defaults to a plain calendar glyph — every date row should read as a date,
   * not as a generic dropdown (`ChevronDown`, `DateField`'s own default). */
  icon?: LucideIcon;
  disabled?: boolean;
  /** Adds a "Borrar" action so the field can go back to empty — for a date
   * that's genuinely optional (e.g. no plazo at all), not just unset yet. */
  clearable?: boolean;
  className?: string;
}

/** Label/value row for a date — the shape `installments`/`debts` already use,
 * now shared so a picker and its icon can't drift between forms. */
export function FormDateField({
  label,
  value,
  onChange,
  id,
  icon = CalendarDays,
  disabled,
  clearable = false,
  className,
}: Readonly<Props>) {
  return (
    <DetailRow label={label} className={className}>
      <DateField
        id={id}
        variant="inline"
        value={value}
        onChange={onChange}
        icon={icon}
        disabled={disabled}
        clearable={clearable}
        aria-label={label}
      />
    </DetailRow>
  );
}
