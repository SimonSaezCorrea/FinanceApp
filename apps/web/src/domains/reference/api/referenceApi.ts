import type { reference } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

/** Global read-only reference data (countries, banks, currencies). */
export const referenceApi = {
  countries: () => apiFetch<reference.Country[]>("/countries"),
  institutions: (filters?: reference.InstitutionFilters) => {
    const params = new URLSearchParams();
    if (filters?.country) params.set("country", filters.country);
    if (filters?.kind) params.set("kind", filters.kind);
    if (filters?.accountType) params.set("accountType", filters.accountType);
    if (filters?.retailFacing) params.set("retailFacing", "true");
    const qs = params.toString();
    return apiFetch<reference.Institution[]>(`/institutions${qs ? `?${qs}` : ""}`);
  },
  currencies: () => apiFetch<reference.Currency[]>("/currencies"),
};
