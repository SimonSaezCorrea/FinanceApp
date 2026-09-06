import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { ACCOUNT_ICON } from "./accountVisuals";

const TYPES: accounts.AccountType[] = [
  "CHECKING",
  "SIGHT",
  "SAVINGS",
  "INVESTMENT",
  "CREDIT_CARD",
  "PREPAID",
  "CASH",
];

/** Account type picker — a plain bordered dropdown (the same `SearchableSelect`
 * every other picker in this form uses), not a row of filled toggle buttons. */
export function AccountTypeToggle({
  value,
  onChange,
  disabledTypes,
  disabledReason,
  className,
  panelClassName,
}: Readonly<{
  value: accounts.AccountType;
  onChange: (type: accounts.AccountType) => void;
  /** Types this account can't (or can no longer) be. Shown greyed-out with
   * `disabledReason` as their tooltip — a prepaid account is a different
   * product, not a setting, so it can never be converted into or out of one. */
  disabledTypes?: accounts.AccountType[];
  disabledReason?: string;
  className?: string;
  /** Forwarded to the underlying `SearchableSelect`'s OPEN dropdown panel. */
  panelClassName?: string;
}>) {
  const { t } = useTranslation();

  const options = TYPES.map((v) => {
    const Icon = ACCOUNT_ICON[v];
    return {
      value: v,
      label: t(`accounts.type.${v}`),
      icon: <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />,
      disabled: v !== value && (disabledTypes?.includes(v) ?? false),
      disabledReason,
    };
  });

  return (
    <SearchableSelect
      id="account-type"
      // The bordered `control` variant defaults to `bg-background` (the page's
      // own token) — a visibly different shade from `--card`, the surface this
      // control actually sits on inside a panel. Overridden here (twMerge, via
      // `cn`, drops the earlier bg- utility) rather than in `SearchableSelect`
      // itself, since other `control` usages elsewhere DO sit directly on
      // `--background` and are correct as they are.
      className={cn("bg-transparent", className)}
      panelClassName={panelClassName}
      value={value}
      onChange={(v) => onChange(v as accounts.AccountType)}
      options={options}
      searchPlaceholder={t("common.search")}
      noResultsLabel={t("common.noResults")}
      aria-label={t("accounts.form.type")}
    />
  );
}
