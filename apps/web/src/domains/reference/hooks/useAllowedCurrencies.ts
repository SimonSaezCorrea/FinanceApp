import { useMemo } from "react";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCurrencies } from "./useReference";

export interface AllowedCurrency {
  code: string;
  name: string;
}

/**
 * The universe of currencies offered by any "pick a currency for a new
 * record" selector in the app (specs/020, FR-005): the logged-in user's own
 * `preferredCurrency` plus their `extraCurrencies`, principal first. Resolved
 * against the full catalogue (`useCurrencies`) only to fill in each code's
 * display name — never widened past the user's own selection.
 *
 * Deliberately NOT used by the picker for the principal currency itself
 * (`PreferencesSection`) or by the "which currency to add as extra" picker
 * (`FinancialCustomizationSection`) — both must keep offering the full MVP
 * catalogue, since narrowing them by this same list would be circular.
 */
export function useAllowedCurrencies(): AllowedCurrency[] {
  const { user } = useAuth();
  const { data: catalogue } = useCurrencies();

  return useMemo(() => {
    if (!user) return [];
    const codes = [user.preferredCurrency, ...user.extraCurrencies];
    return codes.map((code) => ({
      code,
      name: catalogue?.find((c) => c.code === code)?.name ?? code,
    }));
  }, [user, catalogue]);
}
