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
