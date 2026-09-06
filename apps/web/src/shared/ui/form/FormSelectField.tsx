import { useTranslation } from "react-i18next";

import { DetailRow } from "../detail-row";
import { SearchableSelect, type SearchableSelectOption } from "../searchable-select";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  /** Overrides what the closed control shows (e.g. a currency's bare code
   * instead of its full option label) — see `SearchableSelect`'s own doc. */
  displayValue?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Label/value row for a picker: search box + scrollable list, never free text
 * in the closed control — the shape `debts`/`recurring`/`installments` already
 * use for accounts, cards and categories. Reach for `Combobox` instead only
 * when the field must accept a value that ISN'T in the list (free-text
 * categories on a movement, say).
 */
export function FormSelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  displayValue,
  id,
  disabled,
  className,
}: Readonly<Props>) {
  const { t } = useTranslation();
  return (
    <DetailRow label={label} className={className}>
      <SearchableSelect
        id={id}
        variant="inline"
        className="w-auto"
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        displayValue={displayValue}
        searchPlaceholder={t("common.search")}
        noResultsLabel={t("common.noResults")}
        disabled={disabled}
        aria-label={label}
      />
    </DetailRow>
  );
}
