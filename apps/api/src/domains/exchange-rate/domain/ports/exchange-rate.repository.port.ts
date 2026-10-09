import type { ExchangeRateEntry, RateCurrency } from "../exchange-rate.entity";

export const EXCHANGE_RATE_REPOSITORY = Symbol("EXCHANGE_RATE_REPOSITORY");

/** Adapter (Principle VI) — the ONLY port allowed to touch the `exchange-rate` table. */
export interface ExchangeRateRepositoryPort {
  /**
   * Upsert keyed on `(currency, date)` — atomic in Postgres, so two overlapping cron ticks (or
   * two instances) leave ONE row (Principle VII, form b). Re-writing a day may only move
   * `valueDate` forward: a carried row is replaced by the real publication, never the reverse.
   */
  upsert(entry: ExchangeRateEntry): Promise<void>;

  /** Same as `upsert`, for many rows in one transaction (history seed, gap fill). */
  upsertMany(entries: readonly ExchangeRateEntry[]): Promise<void>;

  /** The row with the greatest `date` of that currency, or null on an empty table. */
  findLatest(currency: RateCurrency): Promise<ExchangeRateEntry | null>;

  /** Rows of `currency` (both when omitted) with `from <= date <= to`, newest first. */
  findRange(
    currency: RateCurrency | undefined,
    from: string,
    to: string,
  ): Promise<ExchangeRateEntry[]>;

  /** `date` of the newest row of that currency, or null. */
  lastDate(currency: RateCurrency): Promise<string | null>;
}
