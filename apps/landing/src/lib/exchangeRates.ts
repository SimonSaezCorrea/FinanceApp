import { readFile } from "node:fs/promises";

import { exchangeRates } from "@finance/contracts";

import { chileDay, daysBefore } from "../domains/rates/lib/chileDay";
import { API_URL } from "./config";

/**
 * The rates the indicator pages and the home block are BUILT with (spec 033, R1/R2): one read of
 * the public endpoint per build — the last 365 days of both currencies, the newest row and the
 * oldest day of each. Build time only (Node): the page carries the result in its HTML.
 *
 * - `EXCHANGE_RATES_SNAPSHOT=<path>` reads a JSON file instead (tests, CI).
 * - Any failure answers `null` (the pages show "sin valor disponible" and the arrival script fills
 *   them in), unless `EXCHANGE_RATES_REQUIRED=true` — the scheduled rebuild — where it throws, so a
 *   run during an API outage never replaces a good deployment with an empty one.
 */
export interface RatesSnapshot {
  /** Chile's day the snapshot was taken for. */
  today: string;
  /** Both currencies, newest first. */
  items: exchangeRates.ExchangeRate[];
  latest: { USD: exchangeRates.ExchangeRate | null; CLF: exchangeRates.ExchangeRate | null };
  first: { USD: string | null; CLF: string | null };
}

/** Days of history a page carries (its "1 año" chart and table). */
export const SNAPSHOT_DAYS = 365;
const TIMEOUT_MS = 10_000;

interface LoadOptions {
  apiUrl?: string;
  today?: string;
  snapshotPath?: string;
  required?: boolean;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
}

export async function loadRatesSnapshot(opts: LoadOptions = {}): Promise<RatesSnapshot | null> {
  const required = opts.required ?? false;
  try {
    if (opts.snapshotPath) {
      const raw = JSON.parse(await readFile(opts.snapshotPath, "utf8")) as { today?: unknown };
      return toSnapshot(raw, String(raw.today));
    }
    const today = opts.today ?? chileDay();
    const from = daysBefore(today, SNAPSHOT_DAYS);
    const url = `${opts.apiUrl ?? API_URL}/api/v1/public/exchange-rates?from=${from}&to=${today}`;
    const res = await (opts.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toSnapshot(await res.json(), today);
  } catch (error) {
    if (required) {
      throw new Error(`The exchange rates could not be loaded for the build: ${String(error)}`);
    }
    console.warn(`[rates] building without exchange rates: ${String(error)}`);
    return null;
  }
}

function toSnapshot(body: unknown, today: string): RatesSnapshot {
  const parsed = exchangeRates.listExchangeRatesResponseSchema.parse(body);
  const from = daysBefore(today, SNAPSHOT_DAYS);
  return {
    today,
    items: parsed.items.filter((r) => r.date >= from && r.date <= today),
    latest: parsed.latest,
    first: parsed.first ?? { USD: null, CLF: null },
  };
}

let cached: Promise<RatesSnapshot | null> | null = null;

/** The snapshot of THIS build, read once and shared by every page that needs it. */
export function buildRatesSnapshot(): Promise<RatesSnapshot | null> {
  cached ??= loadRatesSnapshot({
    snapshotPath: process.env.EXCHANGE_RATES_SNAPSHOT || undefined,
    required: process.env.EXCHANGE_RATES_REQUIRED === "true",
  });
  return cached;
}
