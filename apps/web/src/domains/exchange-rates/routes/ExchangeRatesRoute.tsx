import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { exchangeRates } from "@finance/contracts";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { DateField } from "../../../shared/ui/date-field";
import { Skeleton } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { CompareDates } from "../components/CompareDates";
import { CurrencyList } from "../components/CurrencyList";
import { summarize } from "../lib/currencySummary";
import { RateSeriesPanel } from "../components/RateSeriesPanel";
import { useExchangeRates } from "../hooks/useExchangeRates";
import { daysBefore, localDay } from "../lib/day";

type Range = "7d" | "30d" | "90d" | "6m" | "1y" | "ytd" | "custom";
const RANGES: readonly Range[] = ["7d", "30d", "90d", "6m", "1y", "ytd", "custom"];
/** Every recorded currency, straight from the contract: adding one there adds it here. */
const CURRENCIES: readonly exchangeRates.ExchangeCurrency[] =
  exchangeRates.exchangeCurrency.options;
/** Series color per currency; any other falls back to the primary token. */
const COLOR: Partial<Record<exchangeRates.ExchangeCurrency, string>> = {
  USD: "hsl(var(--primary))",
  CLF: "hsl(var(--accent))",
};
/** URL parameter holding the selected currency, so a link or Back lands on the same one. */
const CURRENCY_PARAM = "moneda";
/** Below this width of its own the screen drops the rail and the title becomes the picker. */
export const RAIL_MIN_WIDTH = 880;
/** Days the navigation reads to show each currency's value and its change since the day before. */
const SUMMARY_DAYS = 7;

function isCurrency(v: string | null): v is exchangeRates.ExchangeCurrency {
  return v !== null && (CURRENCIES as readonly string[]).includes(v);
}

/** The first day of a preset range ending today (inclusive). */
function presetFrom(range: Exclude<Range, "custom">, today: string): string {
  switch (range) {
    case "7d":
      return daysBefore(today, 6);
    case "30d":
      return daysBefore(today, 29);
    case "90d":
      return daysBefore(today, 89);
    case "6m":
      return daysBefore(today, 182);
    case "1y":
      return daysBefore(today, 364);
    case "ytd":
      return `${today.slice(0, 4)}-01-01`;
  }
}

/**
 * "Tipos de cambio" (spec 030): ONE currency at a time, in pesos, over a chosen range.
 *
 * Navigation (canvas D1 + D2): with room, a rail lists every currency with its value today and its
 * change since the day before; without it, the selected currency's name IS the title and unfolds
 * that same list. Either way only the selected currency's history is requested (the list reads a
 * short window of all of them). The currency lives in the URL. Read-only reference data.
 */
export function ExchangeRatesRoute() {
  const { t, i18n } = useTranslation();
  const today = localDay();
  const [shellRef, shellWidth] = useElementWidth();
  const wide = (shellWidth ?? 0) >= RAIL_MIN_WIDTH;
  const [menuOpen, setMenuOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get(CURRENCY_PARAM);
  const currency: exchangeRates.ExchangeCurrency = isCurrency(param) ? param : CURRENCIES[0]!;
  const selectCurrency = (c: exchangeRates.ExchangeCurrency) => {
    setMenuOpen(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(CURRENCY_PARAM, c);
        return next;
      },
      { replace: true },
    );
  };

  const [range, setRange] = useState<Range>("30d");
  const [customFrom, setCustomFrom] = useState(() => daysBefore(today, 29));
  const [customTo, setCustomTo] = useState(today);
  const from = range === "custom" ? customFrom : presetFrom(range, today);
  const to = range === "custom" ? customTo : today;
  // Any length works: a long range is fetched in bounded windows (`useExchangeRates`).
  const invalidRange = from === "" || to === "" || exchangeRates.exchangeRangeDays(from, to) === 0;

  const window = useExchangeRates(
    { currency, from, to },
    // Switching range keeps the current chart up until the new one lands, instead of a skeleton.
    { enabled: !invalidRange, keepPrevious: true },
  );
  const recent = useExchangeRates({ from: daysBefore(today, SUMMARY_DAYS), to: today });
  const summaries = summarize(recent.data?.items ?? []);

  const name = (c: exchangeRates.ExchangeCurrency) =>
    t(`exchangeRates.names.${c}`, { defaultValue: c });
  const colorOf = (c: exchangeRates.ExchangeCurrency) => COLOR[c] ?? "hsl(var(--primary))";

  const list = (
    <CurrencyList
      currencies={CURRENCIES}
      value={currency}
      onChange={selectCurrency}
      name={name}
      color={colorOf}
      summaries={summaries}
    />
  );

  // Range presets as round pills centred under the chart (canvas D2); a custom range unfolds its
  // two dates beneath them.
  const rangeControls = (
    <div className="flex max-w-full flex-col items-center gap-2">
      <div
        role="group"
        aria-label={t("exchangeRates.range.label")}
        className="flex max-w-full gap-1 overflow-x-auto"
      >
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            aria-label={t(`exchangeRates.range.${r}`)}
            title={t(`exchangeRates.range.${r}`)}
            onClick={() => setRange(r)}
            className={cn(
              "flex h-9 min-w-12 shrink-0 items-center justify-center rounded-full px-3 text-[13px] font-semibold transition-colors duration-150 active:scale-[0.97]",
              range === r
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r === "custom" ? (
              <CalendarDays aria-hidden className="size-4" />
            ) : (
              t(`exchangeRates.range.short.${r}`)
            )}
          </button>
        ))}
      </div>
      {range === "custom" ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <DateField
            value={customFrom}
            onChange={setCustomFrom}
            aria-label={t("exchangeRates.custom.from")}
            className="w-48"
          />
          <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
          <DateField
            value={customTo}
            onChange={setCustomTo}
            aria-label={t("exchangeRates.custom.to")}
            className="w-48"
          />
        </div>
      ) : null}
      {invalidRange ? (
        <p className="text-xs text-warning">{t("exchangeRates.custom.inverted")}</p>
      ) : null}
    </div>
  );

  const shortDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
    });
  const rangeLabel =
    range === "custom"
      ? t("exchangeRates.range.since.custom", { from: shortDay(from), to: shortDay(to) })
      : t(`exchangeRates.range.since.${range}`);
  const panel = (rows: exchangeRates.ExchangeRate[]) => (
    <RateSeriesPanel
      currency={currency}
      rows={rows}
      name={name(currency)}
      color={colorOf(currency)}
      today={today}
      rangeLabel={rangeLabel}
      rangeControls={rangeControls}
      requestedFrom={from}
    />
  );

  let body: React.ReactNode;
  if (invalidRange) {
    body = panel([]);
  } else if (window.isLoading) {
    body = <Skeleton className="h-96 rounded-2xl" aria-busy />;
  } else if (window.isError) {
    body = <ErrorState inline error={window.error} onRetry={() => void window.refetch()} />;
  } else {
    const data = window.data;
    const items = data?.items ?? [];
    if (!data || (items.length === 0 && !data.latest[currency])) {
      body = <EmptyState title={t("exchangeRates.empty")} />;
    } else {
      body = (
        <>
          {panel(items.filter((r) => r.currency === currency))}
          <CompareDates
            key={currency}
            today={today}
            currency={currency}
            inSentence={t(`exchangeRates.inSentence.${currency}`, { defaultValue: name(currency) })}
          />
        </>
      );
    }
  }

  const source = <p className="text-xs text-muted-foreground">{t("exchangeRates.source")}</p>;

  if (wide) {
    return (
      <div ref={shellRef} className="flex items-start gap-8">
        <aside className="flex w-64 shrink-0 flex-col gap-1">
          <h1 className="px-1 text-2xl font-semibold tracking-tight">{t("exchangeRates.title")}</h1>
          <p className="mb-3 px-1 text-sm text-muted-foreground">{t("exchangeRates.subtitle")}</p>
          <nav aria-label={t("exchangeRates.picker.label")}>{list}</nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-5">
          <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            <span
              aria-hidden
              className="size-3 rounded-[3px]"
              style={{ background: colorOf(currency) }}
            />
            {name(currency)}
            <span className="text-base font-medium text-muted-foreground">{currency}</span>
          </h2>
          {body}
          {source}
        </main>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-sm text-muted-foreground">{t("exchangeRates.title")}</h1>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="exchange-currency-menu"
          aria-label={t("exchangeRates.picker.change", { currency: name(currency) })}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-3 self-start rounded-lg py-1 text-2xl font-semibold tracking-tight active:scale-[0.98]"
        >
          <span
            aria-hidden
            className="size-3 rounded-[3px]"
            style={{ background: colorOf(currency) }}
          />
          {name(currency)}
          <span className="text-base font-medium text-muted-foreground">{currency}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 text-muted-foreground transition-transform duration-150",
              menuOpen && "rotate-180",
            )}
          />
        </button>
      </div>
      {menuOpen ? (
        <nav
          id="exchange-currency-menu"
          aria-label={t("exchangeRates.picker.label")}
          className="rounded-2xl border border-border bg-card/50 p-2"
        >
          {list}
        </nav>
      ) : null}
      {body}
      {source}
    </div>
  );
}
