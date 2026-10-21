/**
 * How an exchange rate reads (spec 030; shared with the public site in spec 033). No `decimal.js`
 * here — only `Intl` — so a page script can import it without the money arithmetic, through
 * `@finance/money/rate-format`.
 */

/**
 * A rate in pesos per unit, always with two decimals ("$979,85", "$41.122,74"): unlike an
 * amount, the cents ARE the information here, so `formatMoney`'s whole-peso rounding for CLP
 * would throw them away. The value is handed to Intl as the decimal STRING the API sent, never
 * through a JS number.
 */
export function formatRate(value: string, locale: string): string {
  const grouping = locale.startsWith("es") ? "es-CL" : locale;
  const number = new Intl.NumberFormat(grouping, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value as unknown as number);
  return `$${number}`;
}

/** A signed rate difference: "+$12,40", "−$3,05", "$0,00". */
export function formatRateChange(change: string, locale: string): string {
  const n = Number(change);
  const abs = formatRate(change.replace(/^-/, ""), locale);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

/** A signed percentage with one decimal: "+1,9 %", "−0,4 %". */
export function formatPercentChange(percent: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(percent) / 100);
}
