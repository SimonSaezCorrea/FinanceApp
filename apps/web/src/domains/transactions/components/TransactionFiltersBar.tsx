import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { Input } from "../../../shared/ui/input";
import type { TransactionViewFilters } from "../lib/transactionMetrics";

interface TransactionFiltersBarProps {
  filters: TransactionViewFilters;
  onChange: (filters: TransactionViewFilters) => void;
  accounts: accounts.BankAccount[];
}

export function TransactionFiltersBar({ filters, onChange, accounts }: TransactionFiltersBarProps) {
  const { t } = useTranslation();

  // Debounced category search
  const [localCategory, setLocalCategory] = useState(filters.categorySearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalCategory(filters.categorySearch);
  }, [filters.categorySearch]);

  const handleCategoryChange = useCallback(
    (value: string) => {
      setLocalCategory(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({ ...filters, categorySearch: value });
      }, 300);
    },
    [filters, onChange],
  );

  function handleAccountChange(value: string) {
    if (value === "") {
      onChange({ ...filters, bankAccountId: undefined, selectedCardId: undefined });
      return;
    }
    // Check if value is a cardId (prefixed with "card:")
    if (value.startsWith("card:")) {
      const cardId = value.slice(5);
      // Find the parent account for this card
      const parentAccount = accounts.find((a) => a.cards.some((c) => c.id === cardId));
      onChange({
        ...filters,
        bankAccountId: parentAccount?.id,
        selectedCardId: cardId,
      });
    } else {
      onChange({ ...filters, bankAccountId: value, selectedCardId: undefined });
    }
  }

  function handleFromChange(value: string) {
    onChange({ ...filters, from: value ? `${value}T00:00:00.000Z` : undefined });
  }

  function handleToChange(value: string) {
    onChange({ ...filters, to: value ? `${value}T23:59:59.999Z` : undefined });
  }

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");
  const inactiveAccounts = accounts.filter((a) => a.status === "INACTIVE");

  const fromDate = filters.from ? filters.from.slice(0, 10) : "";
  const toDate = filters.to ? filters.to.slice(0, 10) : "";

  // Build selected value for the account/card select
  let selectedAccountValue = "";
  if (filters.selectedCardId) {
    selectedAccountValue = `card:${filters.selectedCardId}`;
  } else if (filters.bankAccountId) {
    selectedAccountValue = filters.bankAccountId;
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Account / Card selector */}
      <div className="flex min-w-[200px] flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t("transactions.filters.account")}</label>
        <select
          value={selectedAccountValue}
          onChange={(e) => handleAccountChange(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t("transactions.filters.allAccounts")}</option>

          {activeAccounts.map((a) => (
            <optgroup key={a.id} label={a.name}>
              <option value={a.id}>{a.name}</option>
              {a.cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {`••••${c.last4} · ${c.name}`}
                </option>
              ))}
            </optgroup>
          ))}

          {filters.showInactiveAccounts &&
            inactiveAccounts.map((a) => (
              <optgroup key={a.id} label={`${a.name} (${t("accounts.status.INACTIVE")})`}>
                <option value={a.id}>{a.name}</option>
              </optgroup>
            ))}
        </select>
      </div>

      {/* Show inactive toggle */}
      <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
        <span className="relative inline-flex h-5 w-9 shrink-0">
          <input
            type="checkbox"
            checked={filters.showInactiveAccounts}
            onChange={(e) => onChange({ ...filters, showInactiveAccounts: e.target.checked })}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
          <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-[left] peer-checked:left-[18px]" />
        </span>
        <span className="text-xs text-muted-foreground">{t("transactions.filters.showInactive")}</span>
      </label>

      {/* Category search */}
      <div className="flex min-w-[160px] flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t("transactions.filters.category")}</label>
        <Input
          value={localCategory}
          onChange={(e) => handleCategoryChange(e.target.value)}
          placeholder={t("transactions.filters.categoryPlaceholder")}
        />
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t("transactions.filters.from")}</label>
        <Input
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => handleFromChange(e.target.value)}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t("transactions.filters.to")}</label>
        <Input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => handleToChange(e.target.value)}
          className="w-36"
        />
      </div>
    </div>
  );
}
