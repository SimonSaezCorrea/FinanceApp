import type { reference } from "@finance/contracts";

import type { SearchableSelectOption } from "../../../shared/ui/searchable-select";

/**
 * An institution as a picker option: labelled with the COMMERCIAL name, searchable
 * also by its registered legal name and its other brands. The user types what's on
 * their card ("Copec Pay", "CuentaRUT"), not the entity that issued it.
 */
export function institutionOption(institution: reference.Institution): SearchableSelectOption {
  return {
    value: institution.id,
    label: institution.name,
    keywords: [institution.legalName, ...institution.brands].filter(
      (term): term is string => !!term,
    ),
  };
}
