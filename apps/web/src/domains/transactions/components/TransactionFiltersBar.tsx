import type { ReactNode } from "react";

import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Switch } from "../../../shared/ui/switch";
import { DateRangeButton } from "./DateRangeButton";
import type { TransactionViewFilters } from "../lib/transactionMetrics";

interface TransactionFiltersBarProps {
  filters: TransactionViewFilters;
  onChange: (filters: TransactionViewFilters) => void;
  accounts: accounts.BankAccount[];
  categories: string[];
}

function PillSelect({
  value,
  onChange,
  children,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}>) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-md border bg-card py-0 pl-3 pr-8 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export function TransactionFiltersBar({
  filters,
  onChange,
  accounts,
  categories,
}: TransactionFiltersBarProps) {
  const { t } = useTranslation();

  function handleAccountChange(value: string) {
    onChange({ ...filters, bankAccountId: value || undefined, selectedCardId: undefined });
  }

  function handleCardChange(value: string) {
    onChange({ ...filters, selectedCardId: value || undefined });
  }

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");
  const inactiveAccounts = accounts.filter((a) => a.status === "INACTIVE");
  const selectedAccount = accounts.find((a) => a.id === filters.bankAccountId);
  const cardOptions = selectedAccount?.cards ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PillSelect value={filters.bankAccountId ?? ""} onChange={handleAccountChange}>
        <option value="">{t("transactions.form.selectAccount")}</option>
        {activeAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        {filters.showInactiveAccounts &&
          inactiveAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {`${a.name} (${t("accounts.status.INACTIVE")})`}
            </option>
          ))}
      </PillSelect>

      {cardOptions.length > 0 ? (
        <PillSelect value={filters.selectedCardId ?? ""} onChange={handleCardChange}>
          <option value="">{t("transactions.form.selectCard")}</option>
          {cardOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {`••••${c.last4} · ${c.name}`}
            </option>
          ))}
        </PillSelect>
      ) : null}

      <PillSelect
        value={filters.categorySearch}
        onChange={(value) => onChange({ ...filters, categorySearch: value })}
      >
        <option value="">{t("transactions.filters.allCategories")}</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </PillSelect>

      <DateRangeButton
        from={filters.from}
        to={filters.to}
        onChange={({ from, to }) => onChange({ ...filters, from, to })}
      />

      <label className="flex cursor-pointer items-center gap-2 pl-1">
        <Switch
          checked={filters.showInactiveAccounts}
          onCheckedChange={(checked) => onChange({ ...filters, showInactiveAccounts: checked })}
          aria-label={t("transactions.filters.showInactive")}
        />
        <span className="text-xs text-muted-foreground">
          {t("transactions.filters.showInactive")}
        </span>
      </label>
    </div>
  );
}
