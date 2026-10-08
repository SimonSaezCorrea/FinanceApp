import type { exchangeRates } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

/** Global read-only reference data (spec 030): the daily dólar observado and UF. */
export const exchangeRatesApi = {
  list: (params: exchangeRates.ListExchangeRatesQuery = {}) => {
    const qs = new URLSearchParams();
    if (params.currency) qs.set("currency", params.currency);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const query = qs.toString();
    return apiFetch<exchangeRates.ListExchangeRatesResponse>(
      `/exchange-rates${query ? `?${query}` : ""}`,
    );
  },
};
