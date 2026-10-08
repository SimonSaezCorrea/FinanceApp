import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exchangeRates } from "@finance/contracts";

import { Badge } from "../../../shared/ui/badge";
import { Card, CardContent } from "../../../shared/ui/card";
import { DateField } from "../../../shared/ui/date-field";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { Skeleton } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { RateChart } from "../components/RateChart";
import { RateTable } from "../components/RateTable";
import { useExchangeRates } from "../hooks/useExchangeRates";
import { daysBefore, localDay } from "../lib/day";
import { formatRate } from "../lib/formatRate";

type Range = "30d" | "1y";
const RANGE_DAYS: Record<Range, number> = { "30d": 29, "1y": 364 };
const CURRENCIES: readonly exchangeRates.ExchangeCurrency[] = ["USD", "CLF"];

/**
 * "Tipos de cambio" (spec 030): the daily dólar observado and UF, in pesos. Read-only
 * reference data — today's value of each, how they moved, and the value of any past day.
 * Nothing here is converted or stored for the person: it is the record the app's suggestions
 * (a USD payment's pesos, a USD account's "≈") are drawn from.
 */
export function ExchangeRatesRoute() {
  const { t, i18n } = useTranslation();
  const today = localDay();
  const [range, setRange] = useState<Range>("30d");
  const [jump, setJump] = useState("");

  const window = useExchangeRates({ from: daysBefore(today, RANGE_DAYS[range]), to: today });
  // A day outside the loaded window answers with its own one-day query.
  const picked = useExchangeRates({ from: jump, to: jump }, { enabled: jump !== "" });

  const header = (
    <PageHeader title={t("exchangeRates.title")} description={t("exchangeRates.subtitle")} />
  );

  if (window.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy>
        {header}
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (window.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState inline error={window.error} onRetry={() => void window.refetch()} />
      </div>
    );
  }

  const data = window.data;
  const items = data?.items ?? [];
  if (!data || (items.length === 0 && !data.latest.USD && !data.latest.CLF)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState title={t("exchangeRates.empty")} />
      </div>
    );
  }

  const name = (c: exchangeRates.ExchangeCurrency) =>
    t(c === "USD" ? "exchangeRates.usd" : "exchangeRates.uf");
  const date = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const pickedRows = picked.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section aria-label={t("exchangeRates.today")} className="grid gap-4 sm:grid-cols-2">
        {CURRENCIES.map((c) => {
          const rate = data.latest[c];
          return (
            <Card key={c} data-testid={`rate-card-${c}`}>
              <CardContent className="flex flex-col gap-1 p-5">
                <span className="text-sm text-muted-foreground">{name(c)}</span>
                {rate ? (
                  <>
                    <span className="text-3xl font-semibold tabular-nums">
                      {formatRate(rate.value, i18n.language)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t("exchangeRates.valueOn", { date: date(rate.date) })}
                      {exchangeRates.isCarried(rate) ? (
                        <Badge
                          variant="warning"
                          title={t("exchangeRates.carriedHint", { date: date(rate.valueDate) })}
                        >
                          {t("exchangeRates.carried")}
                        </Badge>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("exchangeRates.noDataForDate")}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <Segmented<Range>
          aria-label={t("exchangeRates.range.label")}
          value={range}
          onChange={setRange}
          options={[
            { value: "30d", label: t("exchangeRates.range.30d") },
            { value: "1y", label: t("exchangeRates.range.1y") },
          ]}
          className="self-start"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {CURRENCIES.map((c) => (
            <Card key={c}>
              <CardContent className="flex flex-col gap-2 p-5">
                <span className="text-sm font-medium">{name(c)}</span>
                <RateChart rows={items.filter((r) => r.currency === c)} label={name(c)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">{t("exchangeRates.jumpTitle")}</h2>
          <DateField
            value={jump}
            onChange={setJump}
            aria-label={t("exchangeRates.jumpToDate")}
            className="w-48"
          />
        </div>
        {jump !== "" && !picked.isLoading ? (
          <Card data-testid="rate-on-date">
            <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
              {picked.isError ? (
                <ErrorState inline error={picked.error} onRetry={() => void picked.refetch()} />
              ) : pickedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  {t("exchangeRates.noDataForDate")}
                </p>
              ) : (
                CURRENCIES.map((c) => {
                  const rate = pickedRows.find((r) => r.currency === c);
                  return (
                    <div key={c} className="flex flex-col gap-0.5">
                      <span className="text-sm text-muted-foreground">{name(c)}</span>
                      {rate ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xl font-semibold tabular-nums">
                            {formatRate(rate.value, i18n.language)}
                          </span>
                          {exchangeRates.isCarried(rate) ? (
                            <Badge variant="warning">{t("exchangeRates.carried")}</Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("exchangeRates.noDataForDate")}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-border">
        <RateTable rows={items} />
      </section>

      <p className="text-xs text-muted-foreground">{t("exchangeRates.source")}</p>
    </div>
  );
}
