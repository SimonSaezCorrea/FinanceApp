import type { exchangeRates } from "@finance/contracts";
import { toMoney } from "@finance/money";

export interface CurrencySummary {
  /** The latest recorded value. */
  value: string;
  /** Change against the previous recorded day, or null when there is only one. */
  change: string | null;
}

/** Latest value and change vs the previous recorded day, per currency, from any rows. */
export function summarize(
  rows: readonly exchangeRates.ExchangeRate[],
): Map<exchangeRates.ExchangeCurrency, CurrencySummary> {
  const byCurrency = new Map<exchangeRates.ExchangeCurrency, exchangeRates.ExchangeRate[]>();
  for (const r of rows) byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r]);
  const out = new Map<exchangeRates.ExchangeCurrency, CurrencySummary>();
  for (const [c, list] of byCurrency) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
    const [last, prev] = sorted;
    if (!last) continue;
    out.set(c, {
      value: last.value,
      change: prev ? toMoney(last.value).minus(prev.value).toFixed(2) : null,
    });
  }
  return out;
}
