import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DetailRow } from "../detail-row";
import { StepButton } from "../step-button";

interface Props<T extends string> {
  label: string;
  /** The fixed, ordered set of values this field cycles through. */
  options: T[];
  value: T;
  onChange: (value: T) => void;
  /** How to print a value — usually a translation lookup. */
  renderValue: (value: T) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Label/value row that cycles a SHORT, FIXED list of values with ‹ › arrows —
 * a periodicity (Semanal ↔ Mensual ↔ Anual), a two-state cursor, anything a
 * dropdown would be overkill for and whose chevron-down would falsely read as
 * "opens a list of many". Wraps around at either end.
 */
export function FormCycleField<T extends string>({
  label,
  options,
  value,
  onChange,
  renderValue,
  disabled,
  className,
}: Readonly<Props<T>>) {
  const { t } = useTranslation();

  function step(dir: 1 | -1) {
    const i = options.indexOf(value);
    const len = options.length;
    onChange(options[(i + dir + len) % len]!);
  }

  return (
    <DetailRow label={label} className={className}>
      <span className="flex items-center gap-2">
        <StepButton
          icon={ChevronLeft}
          label={t("common.decrease")}
          onClick={() => step(-1)}
          disabled={disabled}
        />
        <span className="w-16 text-center font-medium text-foreground">{renderValue(value)}</span>
        <StepButton
          icon={ChevronRight}
          label={t("common.increase")}
          onClick={() => step(1)}
          disabled={disabled}
        />
      </span>
    </DetailRow>
  );
}
