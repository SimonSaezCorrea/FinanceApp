import { currencyPickerLabel } from "../../../shared/lib/currencyLabel";
import { cn } from "../../../shared/lib/cn";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { useAllowedCurrencies } from "../hooks/useAllowedCurrencies";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  hideDescriptionWhenClosed?: boolean;
  className?: string;
  variant?: "control" | "inline";
  align?: "start" | "end";
  /** Currency codes to drop from the allowed set — e.g. a card's own extra
   * sub-limit rows must add a currency OTHER than the account's own. */
  exclude?: string[];
  /** Freezes the field regardless of how many currencies are allowed — e.g. a
   * savings goal's currency locks once it has a real aporte. */
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * The currency picker for a NEW record (account, card sub-limit, transaction,
 * savings goal, recurring expense, instalment plan, debt) — specs/020,
 * FR-005/006/007. Its options are the logged-in user's own
 * `preferredCurrency` + `extraCurrencies` (`useAllowedCurrencies`), never the
 * full MVP catalogue.
 *
 * With a single allowed currency (no extras configured) there is nothing to
 * choose between, so this renders a plain, non-interactive value instead of a
 * `SearchableSelect` — no chevron, no panel, matching `SearchableSelect`'s own
 * closed-trigger classes so the field doesn't visually jump once a second
 * currency is added and it becomes a real picker.
 *
 * NOT used by the principal-currency picker (`PreferencesSection`, still the
 * full catalogue — this field would be circular there) nor by the "which
 * currency to add as extra" picker (`FinancialCustomizationSection`, which
 * must keep offering every currency to add).
 */
export function CurrencyField({
  id,
  value,
  onChange,
  searchPlaceholder,
  noResultsLabel,
  hideDescriptionWhenClosed,
  className,
  variant = "control",
  align,
  exclude,
  disabled,
  "aria-label": ariaLabel,
}: Readonly<Props>) {
  const allAllowed = useAllowedCurrencies();
  const allowed = exclude ? allAllowed.filter((c) => !exclude.includes(c.code)) : allAllowed;

  const options = allowed.map((c) => ({
    value: c.code,
    label: currencyPickerLabel(c.code),
    description: c.name,
  }));
  // Same guard every call site already applied before centralizing here: a
  // value outside the user's current allowed set (existing data, FR-008)
  // must still be selectable/displayable, never silently dropped.
  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: currencyPickerLabel(value), description: "" });
  }

  if (allowed.length <= 1) {
    return (
      <output
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center gap-2 text-sm",
          variant === "control"
            ? "min-h-10 rounded-md border border-input bg-background px-3 py-2 text-left"
            : "min-h-8 justify-end text-right font-medium",
          disabled && "opacity-50",
          className,
        )}
      >
        <span className="truncate">{currencyPickerLabel(value || allowed[0]?.code || "")}</span>
      </output>
    );
  }

  return (
    <SearchableSelect
      id={id}
      variant={variant}
      align={align}
      className={className}
      value={value}
      onChange={onChange}
      options={options}
      displayValue={currencyPickerLabel(value)}
      hideDescriptionWhenClosed={hideDescriptionWhenClosed}
      disabled={disabled}
      searchPlaceholder={searchPlaceholder}
      noResultsLabel={noResultsLabel}
      aria-label={ariaLabel}
    />
  );
}
