import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ExchangeCurrency, ExchangeRate } from "@finance/contracts/exchange-rate-rules";
import { isCarried } from "@finance/contracts/exchange-rate-rules";
import { formatRate } from "@finance/money/rate-format";

import type { Language } from "../../../lib/language";
import { formatDay } from "../lib/chileDay";

export interface HomeRatesProps {
  lang: Language;
  latest: Record<ExchangeCurrency, ExchangeRate | null>;
  /** The indicator page of each currency in this language. */
  links: Record<ExchangeCurrency, string>;
}

const ORDER: { currency: ExchangeCurrency; page: "ufValue" | "dollarRate" }[] = [
  { currency: "CLF", page: "ufValue" },
  { currency: "USD", page: "dollarRate" },
];

/**
 * The home's "UF y dólar hoy" block (spec 033, FR-013): the value of the day of each indicator as
 * built, with the same `[data-rate-*]` hooks the indicator pages use, so the arrival script
 * (`initRatesHome`) brings them up to date. Rendered at build time only, never hydrated.
 */
export function HomeRates({ lang, latest, links }: Readonly<HomeRatesProps>) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="landing-rates-title"
      className="reveal grid gap-6 border-t py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center lg:gap-14 lg:py-20"
    >
      <div className="flex max-w-[52ch] flex-col gap-3.5">
        <h2 id="landing-rates-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("landing.rates.home.title")}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("landing.rates.home.body")}
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ORDER.map(({ currency, page }) => {
          const row = latest[currency];
          return (
            <li key={currency}>
              <a
                href={links[currency]}
                data-rate-root=""
                data-currency={currency}
                className="group flex h-full flex-col gap-1.5 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <span className="text-sm font-medium text-foreground">
                  {t(`landing.rates.nav.${page}`)}
                </span>
                <span data-rate-body="" hidden={!row}>
                  <span
                    data-rate-value=""
                    className="block text-3xl font-semibold tabular-nums tracking-tight"
                  >
                    {row ? formatRate(row.value, lang) : ""}
                  </span>
                </span>
                <span data-rate-label="" className="text-sm text-muted-foreground">
                  {row
                    ? t("landing.rates.headline.valueOf", { date: formatDay(row.date, lang) })
                    : ""}
                </span>
                <span
                  data-rate-carried=""
                  hidden={!row || !isCarried(row)}
                  className="text-xs text-warning"
                >
                  {row && isCarried(row)
                    ? t("landing.rates.headline.carried", {
                        date: formatDay(row.valueDate, lang),
                      })
                    : ""}
                </span>
                <span
                  data-rate-unavailable=""
                  hidden={!!row}
                  className="text-sm text-muted-foreground"
                >
                  {t("landing.rates.headline.unavailable")}
                </span>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary">
                  {t("landing.rates.home.see")}
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
