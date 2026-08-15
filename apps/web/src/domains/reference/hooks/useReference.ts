import { useQuery } from "@tanstack/react-query";

import type { accounts } from "@finance/contracts";

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

/** `accountType` narrows the list to the institutions that offer that product
 * (permissively — one with no catalogued products is always included).
 * Corporate-only entities are always excluded: this is a personal-finance app, so
 * a foreign branch or a BaaS provider is noise in every picker. */
export function useInstitutions(
  country?: string,
  kind?: "BANK" | "NON_BANK_ISSUER",
  accountType?: accounts.AccountType,
) {
  return useQuery({
    queryKey: ["institutions", country ?? "all", kind ?? "all", accountType ?? "all", "retail"],
    queryFn: () => referenceApi.institutions({ country, kind, accountType, retailFacing: true }),
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
