import { useQuery } from "@tanstack/react-query";

import { exchangeRates } from "@finance/contracts";

import { exchangeRatesApi } from "../api/exchangeRatesApi";
import { daysBefore, localDay } from "../lib/day";

// The recorder runs hourly at most, so a value cannot change faster than that.
const STALE = 1000 * 60 * 10;

/** A bounded window of rates; omitted bounds default to the last 30 days (server-side). */
export function useExchangeRates(params: exchangeRates.ListExchangeRatesQuery = {}) {
  return useQuery({
    queryKey: ["exchange-rates", params.currency ?? "all", params.from ?? "", params.to ?? ""],
    queryFn: () => exchangeRatesApi.list(params),
    staleTime: STALE,
  });
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
