import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";

const TYPES: accounts.AccountType[] = [
  "CHECKING",
  "SIGHT",
  "SAVINGS",
  "INVESTMENT",
  "CREDIT_LINE",
  "CASH",
];

/** Account type picker as a wrapping group of toggle buttons (not a dropdown). */
export function AccountTypeToggle({
  value,
  onChange,
}: Readonly<{
  value: accounts.AccountType;
  onChange: (type: accounts.AccountType) => void;
}>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("accounts.form.type")}>
      {TYPES.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === v
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card text-foreground hover:bg-muted",
          )}
        >
          {t(`accounts.type.${v}`)}
        </button>
      ))}
    </div>
  );
}
