import type { auth } from "@finance/contracts";

import { useCountries } from "../../reference/hooks/useReference";

// Fallback when no country is selected (e.g. existing data saved before a country was set) —
// otherwise the options come from the selected country's own `identifierTypes` (a country may
// support more than one document type; the vocabulary is data, not one fixed global list).
export const ALL_IDENTIFIER_TYPES: NonNullable<auth.CurrentUser["identifierType"]>[] = [
  "RUT",
  "DNI",
  "PASSPORT",
  "OTHER",
];

export function useAvailableIdentifierTypes(
  countryId: string | null,
): NonNullable<auth.CurrentUser["identifierType"]>[] {
  const { data: countries } = useCountries();
  const country = countries?.find((c) => c.id === countryId);
  return country && country.identifierTypes.length > 0
    ? country.identifierTypes
    : ALL_IDENTIFIER_TYPES;
}
