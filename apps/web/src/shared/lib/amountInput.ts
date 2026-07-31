// Bare "es" (no region) only groups digits from 10,000 up (CLDR/Spain rule);
// Chile groups from 1,000, so CLP amounts need "es-CL" specifically.
export function groupingLocaleFor(currency: string, uiLocale: string): string {
  return currency === "CLP" ? "es-CL" : uiLocale;
}

/** Formats a raw (ungrouped) integer-string amount with locale thousands separators. */
export function formatAmountDisplay(raw: string, locale: string): string {
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n.toLocaleString(locale) : raw;
}
