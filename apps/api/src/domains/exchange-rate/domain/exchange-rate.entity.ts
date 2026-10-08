import type { exchangeRates } from "@finance/contracts";

/** The two currencies whose pesos value is recorded daily. */
export type RateCurrency = exchangeRates.ExchangeCurrency;
export const RATE_CURRENCIES: readonly RateCurrency[] = ["USD", "CLF"];

/** One published value of the source: what it quotes and the day it quotes it for. */
export interface PublishedValue {
  /** The day the source published `value` (`YYYY-MM-DD`). */
  valueDate: string;
  /** Pesos per one unit of the currency, as a decimal string. */
  value: string;
}

/**
 * What the table stores for one (currency, Chile day). `carried` is NOT a field: a row is a
 * "dato arrastrado" exactly when `valueDate < date`, so a later real publication only has to
 * raise `valueDate` and the mark disappears by itself.
 */
export interface ExchangeRateEntry extends PublishedValue {
  currency: RateCurrency;
  /** The calendar day this row answers for, in Chile (`YYYY-MM-DD`). */
  date: string;
}

/** `YYYY-MM-DD` of the day `n` days after `day` (negative: before) — UTC arithmetic on a plain
 * calendar date, so no time zone or DST can move it. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` of the day after `day`. */
export function nextDay(day: string): string {
  return addDays(day, 1);
}

/** The calendar day it is in Chile at `now` (America/Santiago, DST included). This is the day a
 * row is filed under, whatever the server's own time zone. */
export function chileDay(now: Date): string {
  // The en-CA locale formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The days `from`..`to`, both included, in order. Empty when `from` is after `to`. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) days.push(d);
  return days;
}

/**
 * The latest value published on or before `day`, out of a series in any order — what a day
 * with no publication of its own (weekend, holiday, source behind) is given. Entries dated AFTER
 * `day` are ignored on purpose: the UF is published days ahead, and a value cannot be published
 * after the day it answers for.
 */
export function latestPublishedOn(
  series: readonly PublishedValue[],
  day: string,
): PublishedValue | null {
  let best: PublishedValue | null = null;
  for (const entry of series) {
    if (entry.valueDate > day) continue;
    if (best === null || entry.valueDate > best.valueDate) best = entry;
  }
  return best;
}

/** True when the row holds the value published on its own day (not carried). */
export function isPublishedOnItsDay(entry: Pick<ExchangeRateEntry, "date" | "valueDate">): boolean {
  return entry.valueDate === entry.date;
}
