import { useCountries } from "../../reference/hooks/useReference";

/** The selected country's international calling code (e.g. "+56"), or null if no country/no code. */
export function useCountryCallingCode(countryId: string | null): string | null {
  const { data: countries } = useCountries();
  return countries?.find((c) => c.id === countryId)?.callingCode ?? null;
}

/** Strips a leading calling code (and the space after it) from a stored phone value, so only the
 * local part is shown in the edit input — the user only ever types the local number. */
export function stripCallingCode(phone: string, callingCode: string | null): string {
  if (!callingCode) return phone;
  const prefix = callingCode.trim();
  return phone.startsWith(prefix) ? phone.slice(prefix.length).trim() : phone;
}

/** Recombines a locally-typed number with the country's calling code for storage. */
export function combinePhone(local: string, callingCode: string | null): string {
  const trimmed = local.trim();
  if (!trimmed) return "";
  return callingCode ? `${callingCode} ${trimmed}` : trimmed;
}
