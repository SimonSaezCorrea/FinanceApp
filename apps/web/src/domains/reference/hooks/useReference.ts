import { useQuery } from "@tanstack/react-query";

import { referenceApi } from "../api/referenceApi";

// Reference data barely changes — cache it aggressively.
const STALE = 1000 * 60 * 60; // 1h

export function useCountries() {
  return useQuery({
    queryKey: ["countries"],
    queryFn: referenceApi.countries,
    staleTime: STALE,
  });
}

export function useInstitutions(country?: string, kind?: "BANK" | "NON_BANK_ISSUER") {
  return useQuery({
    queryKey: ["institutions", country ?? "all", kind ?? "all"],
    queryFn: () => referenceApi.institutions({ country, kind }),
    staleTime: STALE,
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: referenceApi.currencies,
    staleTime: STALE,
  });
}
