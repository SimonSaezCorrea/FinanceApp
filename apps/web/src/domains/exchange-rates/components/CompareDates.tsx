import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { exchangeRates } from "@finance/contracts";

import { DateField } from "../../../shared/ui/date-field";
import { useRateOn } from "../hooks/useExchangeRates";
import { daysBefore } from "../lib/day";
import { formatPercentChange, formatRateChange } from "../lib/formatChange";
import { formatRate } from "../lib/formatRate";
import { rateChange } from "../lib/rangeStats";

interface CompareDatesProps {
  readonly today: string;
  readonly currency: exchangeRates.ExchangeCurrency;
  /** The currency as it reads inside a sentence ("el dólar", "la UF"). */
  readonly inSentence: string;
}

/**
 * The selected currency between two days, read as a sentence (canvas D2): "Entre el [9 sept] y el
 * [hoy] el dólar pasó de $933,82 a $979,85." with the change on the right — e.g. between a purchase
 * in dollars and the day it was paid. Each day takes the rate that applied on it (`useRateOn`: a
 * weekend gets Friday's), so any past date answers.
 */
export function CompareDates({ today, currency, inSentence }: CompareDatesProps) {
  const { t, i18n } = useTranslation();
  const [from, setFrom] = useState(() => daysBefore(today, 30));
  const [to, setTo] = useState(today);
  const start = useRateOn(currency, from, { enabled: from !== "" });
  const end = useRateOn(currency, to, { enabled: to !== "" });
  const ready = !start.isLoading && !end.isLoading;
  const diff = start.rate && end.rate ? rateChange(start.rate.value, end.rate.value) : null;

  let sentence = "…";
  if (ready && start.rate && end.rate)
    sentence = t("exchangeRates.compare.moved", {
      currency: inSentence,
      from: formatRate(start.rate.value, i18n.language),
      to: formatRate(end.rate.value, i18n.language),
    });
  else if (ready) sentence = t("exchangeRates.noDataForDate");

  return (
    <section
      aria-label={t("exchangeRates.compare.title")}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-5"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[15px]">
        <span>{t("exchangeRates.compare.between")}</span>
        <DateField
          value={from}
          onChange={setFrom}
          aria-label={t("exchangeRates.compare.from")}
          className="w-48"
        />
        <span>{t("exchangeRates.compare.and")}</span>
        <DateField
          value={to}
          onChange={setTo}
          aria-label={t("exchangeRates.compare.to")}
          className="w-48"
        />
        <span className="tabular-nums" data-testid="rate-compare-sentence">
          {sentence}
        </span>
      </div>
      {diff ? (
        <span data-testid="rate-compare" className="text-xl font-semibold tabular-nums">
          {formatRateChange(diff.change, i18n.language)}{" "}
          <span className="text-base font-medium text-muted-foreground">
            ({formatPercentChange(diff.percent, i18n.language)})
          </span>
        </span>
      ) : null}
    </section>
  );
}
