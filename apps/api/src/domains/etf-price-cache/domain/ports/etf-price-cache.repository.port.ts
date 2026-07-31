export const ETF_PRICE_CACHE_REPOSITORY = Symbol("ETF_PRICE_CACHE_REPOSITORY");

/** One cached daily quote for a symbol. Money-ish values cross as strings, like
 * every other decimal in this codebase. */
export interface EtfQuoteRow {
  symbol: string;
  fetchedAt: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | null;
  rawJson?: unknown;
}

/**
 * Port for the `etf-price-cache` table. The live ETF quote feature (Alpha
 * Vantage) is **not implemented** — nothing in the app reads or writes this table
 * today (see "Deferred" in CLAUDE.md and docs/PENDING.md). The port + adapter
 * exist so the table already has its single owner when that feature lands.
 */
export interface EtfPriceCacheRepositoryPort {
  find(symbol: string): Promise<EtfQuoteRow | null>;
  upsert(row: EtfQuoteRow): Promise<void>;
}
