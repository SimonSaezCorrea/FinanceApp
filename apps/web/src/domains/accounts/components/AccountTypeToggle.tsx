import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";

const TYPES: accounts.AccountType[] = [
  "CHECKING",
  "SIGHT",
  "SAVINGS",
  "INVESTMENT",
  "CREDIT_CARD",
  "PREPAID",
  "CASH",
];

/** Account type picker as a wrapping group of toggle buttons (not a dropdown). */
export function AccountTypeToggle({
  value,
  onChange,
  disabledTypes,
  disabledReason,
}: Readonly<{
  value: accounts.AccountType;
  onChange: (type: accounts.AccountType) => void;
  /** Types this account can't (or can no longer) be. Rendered as genuinely
   * `disabled` buttons — a prepaid account is a different product, not a setting,
   * so it can never be converted into or out of one. */
  disabledTypes?: accounts.AccountType[];
  disabledReason?: string;
}>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("accounts.form.type")}>
      {TYPES.map((v) => {
        const disabled = v !== value && (disabledTypes?.includes(v) ?? false);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === v
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted",
              disabled && "cursor-not-allowed opacity-50 hover:bg-card",
            )}
          >
            {t(`accounts.type.${v}`)}
          </button>
        );
      })}
    </div>
  );
}
