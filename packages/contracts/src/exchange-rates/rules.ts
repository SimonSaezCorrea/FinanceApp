/**
 * The exchange-rate rules with no zod (spec 033): the public site's pages import these through
 * `@finance/contracts/exchange-rate-rules` so their scripts stay small, and `./index.ts` re-exports
 * them, so the app and the API keep using one definition.
 */

export type ExchangeCurrency = "USD" | "CLF";

/** One day of one currency, as the API answers it (see `exchangeRateSchema`). */
export interface ExchangeRate {
  currency: ExchangeCurrency;
  /** The day this row answers for, `YYYY-MM-DD` (Chile's day). */
  date: string;
  /** Pesos per ONE unit of `currency`, decimal string. */
  value: string;
  /** The day the source actually published `value`. Earlier than `date` ⇒ carried forward. */
  valueDate: string;
}

/** "Dato arrastrado": the day has the last known value because nothing newer was published. */
export function isCarried(rate: Pick<ExchangeRate, "date" | "valueDate">): boolean {
  return rate.valueDate < rate.date;
}

/**
 * The rate that applies on `day`: the row with the greatest `date` that is not later than it, or
 * null when there is none that old. Pure, so a payment form, a net-worth total and the rates
 * screen all pick the same row.
 */
export function rateOn(
  rows: readonly ExchangeRate[],
  currency: ExchangeCurrency,
  day: string,
): ExchangeRate | null {
  let best: ExchangeRate | null = null;
  for (const r of rows) {
    if (r.currency !== currency || r.date > day) continue;
    if (best === null || r.date > best.date) best = r;
  }
  return best;
}

/** Most days one `GET /exchange-rates` may span. */
export const EXCHANGE_RANGE_MAX_DAYS = 400;
/** What the API answers with when no range is given. */
export const EXCHANGE_DEFAULT_RANGE_DAYS = 30;
