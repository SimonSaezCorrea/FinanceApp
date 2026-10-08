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

/** The characters a locale writes numbers with. */
function separatorsOf(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1_234_567.5);
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
  };
}

/**
 * What the person typed into an amount field, as the canonical decimal string the rest of the
 * app holds ("." as the separator, never grouped, at most `decimals` decimals — 0 for a peso,
 * which has no cents). Reads the locale's own separators, so "1.234,5" is 1234.5 in Spanish
 * and 1,234.5 in English; and, because a numeric pad types ".", a dot followed by one or two
 * digits at the end is a decimal point even where the locale groups with it ("50.41").
 *
 * A trailing separator is kept ("50,"): the person is still typing the decimals.
 */
export function parseTypedAmount(raw: string, locale: string, decimals: number): string {
  const { group, decimal } = separatorsOf(locale);
  let text = raw.trim();
  if (decimals > 0 && decimal !== "." && !text.includes(decimal)) {
    const dotted = /^(.*)\.(\d{1,2})$/.exec(text);
    if (dotted) text = `${dotted[1]}${decimal}${dotted[2]}`;
  }
  if (group) text = text.split(group).join("");
  const at = text.indexOf(decimal);
  const integerRaw = at === -1 ? text : text.slice(0, at);
  const fractionRaw = at === -1 ? "" : text.slice(at + decimal.length);

  const integer = integerRaw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (decimals <= 0) return integer;
  const fraction = fractionRaw.replace(/\D/g, "").slice(0, decimals);
  if (at === -1) return integer;
  return `${integer === "" ? "0" : integer}.${fraction}`;
}

/** The inverse of `parseTypedAmount`: a canonical amount as the locale writes it, keeping a
 * trailing separator and typed trailing zeros so the field never fights the person typing. */
export function formatTypedAmount(canonical: string, locale: string): string {
  if (!canonical) return "";
  const { decimal } = separatorsOf(locale);
  const at = canonical.indexOf(".");
  const integer = at === -1 ? canonical : canonical.slice(0, at);
  const grouped = integer === "" ? "" : Number(integer).toLocaleString(locale);
  return at === -1 ? grouped : `${grouped}${decimal}${canonical.slice(at + 1)}`;
}
