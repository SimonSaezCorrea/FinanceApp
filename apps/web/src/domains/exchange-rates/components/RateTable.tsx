import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { exchangeRates } from "@finance/contracts";

import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { formatRate } from "../lib/formatRate";

interface RateTableProps {
  readonly rows: readonly exchangeRates.ExchangeRate[];
}

/** One row per day with both currencies side by side; a carried value says so in its own cell. */
export function RateTable({ rows }: RateTableProps) {
  const { t, i18n } = useTranslation();
  const days = useMemo(() => {
    const byDay = new Map<
      string,
      { USD?: exchangeRates.ExchangeRate; CLF?: exchangeRates.ExchangeRate }
    >();
    for (const r of rows) byDay.set(r.date, { ...byDay.get(r.date), [r.currency]: r });
    return [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [rows]);

  const date = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const cell = (rate: exchangeRates.ExchangeRate | undefined) =>
    rate ? (
      <span className="inline-flex items-baseline gap-2">
        {exchangeRates.isCarried(rate) ? (
          <span
            className="text-xs text-muted-foreground"
            title={t("exchangeRates.carriedHint", { date: rate.valueDate })}
          >
            {t("exchangeRates.carriedShort")}
          </span>
        ) : null}
        <span>{formatRate(rate.value, i18n.language)}</span>
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <Table>
      <THead>
        <TR>
          <TH>{t("exchangeRates.table.date")}</TH>
          <TH numeric>{t("exchangeRates.table.usd")}</TH>
          <TH numeric>{t("exchangeRates.table.uf")}</TH>
        </TR>
      </THead>
      <tbody>
        {days.map(([day, pair]) => (
          <TR key={day}>
            <TD className="whitespace-nowrap">{date(day)}</TD>
            <TD numeric>{cell(pair.USD)}</TD>
            <TD numeric>{cell(pair.CLF)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
