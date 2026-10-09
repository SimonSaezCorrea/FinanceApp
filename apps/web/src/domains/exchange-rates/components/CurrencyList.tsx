import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { exchangeRates } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";
import type { CurrencySummary } from "../lib/currencySummary";
import { formatRateChange } from "../lib/formatChange";
import { formatRate } from "../lib/formatRate";

/** Past this many currencies the list grows a search box. */
export const CURRENCY_SEARCH_MIN = 5;

interface CurrencyListProps {
  readonly currencies: readonly exchangeRates.ExchangeCurrency[];
  readonly value: exchangeRates.ExchangeCurrency;
  readonly onChange: (c: exchangeRates.ExchangeCurrency) => void;
  readonly name: (c: exchangeRates.ExchangeCurrency) => string;
  readonly color: (c: exchangeRates.ExchangeCurrency) => string;
  readonly summaries: ReadonlyMap<exchangeRates.ExchangeCurrency, CurrencySummary>;
}

/**
 * Every currency with its value today — the screen's navigation. The same list is the rail on a
 * wide screen and what the currency title unfolds on a narrow one, so both behave alike. A long
 * catalogue gets a search box instead of piling up.
 */
export function CurrencyList({
  currencies,
  value,
  onChange,
  name,
  color,
  summaries,
}: CurrencyListProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const searchable = currencies.length >= CURRENCY_SEARCH_MIN;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? currencies.filter((c) => `${name(c)} ${c}`.toLowerCase().includes(needle))
    : currencies;

  return (
    <div className="flex flex-col gap-1.5">
      {searchable ? (
        <label className="mb-1 flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
          <Search aria-hidden className="size-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("exchangeRates.picker.search")}
            aria-label={t("exchangeRates.picker.search")}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      ) : null}
      <ul aria-label={t("exchangeRates.picker.label")} className="flex flex-col gap-1">
        {shown.map((c) => {
          const selected = c === value;
          const summary = summaries.get(c);
          return (
            <li key={c}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onChange(c)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors duration-150 active:scale-[0.98]",
                  selected ? "border-border2 bg-card" : "border-transparent hover:bg-card",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-[2px]"
                      style={{ background: color(c) }}
                    />
                    <span className={cn(selected && "text-foreground")}>{name(c)}</span>
                  </span>
                  <span className="text-xs">{c}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-lg font-semibold text-foreground">
                    {summary ? formatRate(summary.value, i18n.language) : "—"}
                  </span>
                  {summary?.change ? (
                    <span className="text-xs text-muted-foreground">
                      {formatRateChange(summary.change, i18n.language)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="px-3.5 py-3 text-sm text-muted-foreground">
            {t("exchangeRates.picker.noResults")}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
