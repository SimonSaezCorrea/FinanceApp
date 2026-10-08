import { z } from "zod";

import { moneyString } from "../common/money";

/**
 * Exchange rates (spec 030): the daily value of the dólar observado (USD) and the UF (CLF), in
 * pesos. Global reference data — one row per currency and Chile calendar day, recorded by the
 * system and read by any signed-in user. The app uses them only to SUGGEST editable conversions;
 * no rule of the domain compares amounts of different currencies, and what gets stored is always
 * what the person confirmed.
 */

export const exchangeCurrency = z.enum(["USD", "CLF"]);
export type ExchangeCurrency = z.infer<typeof exchangeCurrency>;

/** A calendar day, `YYYY-MM-DD` (Chile's day, never an instant). */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const exchangeRateSchema = z
  .object({
    currency: exchangeCurrency,
    /** The day this row answers for. */
    date: isoDay,
    /** Pesos per ONE unit of `currency`. */
    value: moneyString.refine((v) => Number(v) > 0, "must be positive"),
    /** The day the source actually published `value`. Earlier than `date` ⇒ carried forward. */
    valueDate: isoDay,
  })
  .refine((r) => r.valueDate <= r.date, {
    message: "a value cannot be published after the day it answers for",
    path: ["valueDate"],
  });
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

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

export const listExchangeRatesQuerySchema = z.object({
  currency: exchangeCurrency.optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type ListExchangeRatesQuery = z.infer<typeof listExchangeRatesQuerySchema>;

export const listExchangeRatesResponseSchema = z.object({
  /** Newest first. */
  items: z.array(exchangeRateSchema),
  /** The most recent row of each currency, whatever range was asked for. */
  latest: z.object({
    USD: exchangeRateSchema.nullable(),
    CLF: exchangeRateSchema.nullable(),
  }),
});
export type ListExchangeRatesResponse = z.infer<typeof listExchangeRatesResponseSchema>;

const DAY_MS = 86_400_000;
const toUtc = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Fills the bounds the caller left out: `to` is today, `from` is 30 days before `to`. */
export function resolveExchangeRange(
  query: Pick<ListExchangeRatesQuery, "from" | "to">,
  today: string,
): { from: string; to: string } {
  const to = query.to ?? today;
  const from = query.from ?? fromUtc(toUtc(to) - EXCHANGE_DEFAULT_RANGE_DAYS * DAY_MS);
  return { from, to };
}

/** How many days `from`..`to` covers, both included; 0 when the range is inverted. */
export function exchangeRangeDays(from: string, to: string): number {
  const span = (toUtc(to) - toUtc(from)) / DAY_MS;
  return span < 0 ? 0 : span + 1;
}
