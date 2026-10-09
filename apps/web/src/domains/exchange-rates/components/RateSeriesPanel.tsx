import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { exchangeRates } from "@finance/contracts";

import { Badge } from "../../../shared/ui/badge";
import { formatPercentChange, formatRateChange } from "../lib/formatChange";
import { formatRate } from "../lib/formatRate";
import { rangeStats } from "../lib/rangeStats";
import { RateChart } from "./RateChart";

interface RateSeriesPanelProps {
  readonly currency: exchangeRates.ExchangeCurrency;
  /** Rows of THIS currency over the range shown. */
  readonly rows: readonly exchangeRates.ExchangeRate[];
  readonly name: string;
  readonly color: string;
  readonly today: string;
  /** What the change is measured over ("últimos 30 días"). */
  readonly rangeLabel: string;
  /** Range controls, centred under the chart. */
  readonly rangeControls: ReactNode;
  /** First day asked for: when the record starts later, the panel says so. */
  readonly requestedFrom: string;
}

/**
 * One currency over the chosen range (canvas D2): the value as the headline with how much it
 * moved and over what, the day it is from and the day before; the chart; the range controls under
 * it; and the range's low/high/average/daily move as four tiles. No card around the headline and
 * chart — they ARE the page.
 */
export function RateSeriesPanel({
  currency,
  rows,
  name,
  color,
  today,
  rangeLabel,
  rangeControls,
  requestedFrom,
}: RateSeriesPanelProps) {
  const { t, i18n } = useTranslation();
  const stats = rangeStats(rows);
  const shortDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
    });
  const longYear = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const longDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  return (
    <section
      data-testid={`rate-card-${currency}`}
      aria-label={name}
      className="flex flex-col gap-5"
    >
      {stats ? (
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span
              data-testid="rate-now"
              className="text-6xl font-semibold leading-none tabular-nums tracking-tight"
            >
              {formatRate(stats.last.value, i18n.language)}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatRateChange(stats.change, i18n.language)}{" "}
              <span className="font-medium">
                ({formatPercentChange(stats.changePercent, i18n.language)})
              </span>
            </span>
            <span className="text-sm text-muted-foreground">{rangeLabel}</span>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t("exchangeRates.valueOnLong", { date: longDay(stats.last.date) })}
              {stats.previous
                ? ` · ${t("exchangeRates.dayBefore", {
                    value: formatRate(stats.previous.value, i18n.language),
                  })}`
                : null}
            </span>
            {exchangeRates.isCarried(stats.last) ? (
              <Badge
                variant="warning"
                title={t("exchangeRates.carriedHint", { date: shortDay(stats.last.valueDate) })}
              >
                {t("exchangeRates.carried")}
              </Badge>
            ) : null}
          </p>
        </header>
      ) : (
        <p className="text-sm text-muted-foreground">{t("exchangeRates.noDataForDate")}</p>
      )}

      <div className="flex flex-col gap-3">
        <RateChart rows={rows} label={name} color={color} id={currency} today={today} />
        <div className="flex flex-col items-center gap-1.5">
          {rangeControls}
          {stats && stats.first.date > requestedFrom ? (
            <p className="text-xs text-muted-foreground">
              {t("exchangeRates.dataSince", { date: longYear(stats.first.date) })}
            </p>
          ) : null}
        </div>
      </div>

      {stats ? (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label={`${t("exchangeRates.stats.min")} · ${shortDay(stats.min.date)}`}
            value={formatRate(stats.min.value, i18n.language)}
          />
          <Tile
            label={`${t("exchangeRates.stats.max")} · ${shortDay(stats.max.date)}`}
            value={formatRate(stats.max.value, i18n.language)}
          />
          <Tile
            label={t("exchangeRates.stats.average")}
            value={formatRate(stats.average, i18n.language)}
          />
          <Tile
            label={t("exchangeRates.stats.dailyMove")}
            value={
              stats.averageDailyMove === null
                ? "—"
                : `±${formatRate(stats.averageDailyMove, i18n.language)}`
            }
          />
        </dl>
      ) : null}
    </section>
  );
}

function Tile({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
