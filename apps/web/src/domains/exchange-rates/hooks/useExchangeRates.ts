import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { exchangeRates } from "@finance/contracts";

import { exchangeRatesApi } from "../api/exchangeRatesApi";
import { daysBefore, localDay, splitRange } from "../lib/day";

// The recorder runs hourly at most, so a value cannot change faster than that.
const STALE = 1000 * 60 * 10;

/** A bounded window of rates; omitted bounds default to the last 30 days (server-side). */
export function useExchangeRates(
  params: exchangeRates.ListExchangeRatesQuery = {},
  options: { enabled?: boolean; keepPrevious?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    // Kept only within the same currency: another currency's rows would flash under the new name.
    placeholderData: (previous, previousQuery) =>
      options.keepPrevious && previousQuery?.queryKey[1] === (params.currency ?? "all")
        ? keepPreviousData(previous)
        : undefined,
    queryKey: ["exchange-rates", params.currency ?? "all", params.from ?? "", params.to ?? ""],
    queryFn: () => listInChunks(params),
    staleTime: STALE,
  });
}

/**
 * One request when the range fits the API's per-request ceiling (`EXCHANGE_RANGE_MAX_DAYS`), else
 * one per window of at most that many days, fetched in parallel and merged newest first — so a
 * range of any length works while every single query the API answers stays bounded.
 */
async function listInChunks(
  params: exchangeRates.ListExchangeRatesQuery,
): Promise<exchangeRates.ListExchangeRatesResponse> {
  if (!params.from || !params.to) return exchangeRatesApi.list(params);
  const windows = splitRange(params.from, params.to, exchangeRates.EXCHANGE_RANGE_MAX_DAYS);
  if (windows.length <= 1) return exchangeRatesApi.list(params);
  const pages = await Promise.all(
    windows.map((w) => exchangeRatesApi.list({ ...params, from: w.from, to: w.to })),
  );
  return {
    items: pages.flatMap((p) => p.items).sort((a, b) => (a.date < b.date ? 1 : -1)),
    // `latest` doesn't depend on the range: any page carries it.
    latest: pages[0]!.latest,
  };
}

/** The newest row of each currency — "el valor vigente". */
export function useLatestRates() {
  return useQuery({
    queryKey: ["exchange-rates", "latest"],
    queryFn: () => exchangeRatesApi.list({ from: localDay(), to: localDay() }),
    staleTime: STALE,
    select: (r) => r.latest,
  });
}

/** How far back a lookup for one day reaches: enough to cross any weekend, holiday or outage. */
const LOOKBACK_DAYS = 60;

/**
 * The rate that applies on `day` (falls back to the closest earlier one), or `null` when there
 * is none — in which case nothing is suggested and the person types the amount.
 */
export function useRateOn(
  currency: exchangeRates.ExchangeCurrency,
  day: string,
  options: { enabled?: boolean } = {},
) {
  const query = useQuery({
    enabled: options.enabled ?? true,
    queryKey: ["exchange-rates", "on", currency, day],
    queryFn: () =>
      exchangeRatesApi.list({ currency, from: daysBefore(day, LOOKBACK_DAYS), to: day }),
    staleTime: STALE,
    select: (r) => exchangeRates.rateOn(r.items, currency, day),
  });
  return { ...query, rate: query.data ?? null };
}
