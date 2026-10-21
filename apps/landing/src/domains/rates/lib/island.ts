import type { ExchangeCurrency, ExchangeRate } from "@finance/contracts/exchange-rate-rules";

import { t } from "../../../i18n";
import type { Language } from "../../../lib/language";
import type { RatesSnapshot } from "../../../lib/exchangeRates";
import type { RatesData } from "../scripts/rates";

/**
 * The JSON island an indicator page or the home block hands its script (build time): the rows it
 * was built with and the few templates the script writes, so the browser never loads a catalog.
 * Placeholders stay as `{{name}}` (the script fills them).
 */
export function ratesIsland(
  lang: Language,
  snapshot: RatesSnapshot | null,
  currency?: ExchangeCurrency,
): RatesData {
  // Each placeholder is "filled" with itself, so the template reaches the browser untouched.
  const keep = (key: string) =>
    t(lang, key, {
      date: "{{date}}",
      value: "{{value}}",
      amount: "{{amount}}",
      percent: "{{percent}}",
    });
  const rows: ExchangeRate[] = snapshot
    ? snapshot.items.filter((r) => !currency || r.currency === currency)
    : [];
  return {
    lang,
    ...(currency ? { currency } : {}),
    today: snapshot?.today ?? "",
    first: currency && snapshot ? snapshot.first[currency] : null,
    rows,
    strings: {
      valueFor: keep("landing.rates.headline.valueOf"),
      carried: keep("landing.rates.headline.carried"),
      change: keep("landing.rates.headline.change"),
      noChange: keep("landing.rates.headline.noChange"),
      noData: keep("landing.rates.date.noData"),
      invalid: keep("landing.rates.date.invalid"),
      future: keep("landing.rates.date.future"),
      loading: keep("landing.rates.date.loading"),
      failed: keep("landing.rates.date.failed"),
      using: keep("landing.rates.converter.using"),
      carriedLabel: keep("landing.rates.history.carried"),
      publishedLabel: keep("landing.rates.history.published"),
    },
  };
}

/** `JSON.stringify` safe inside `<script type="application/json">` (no `</script>` break-out). */
export function islandJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
