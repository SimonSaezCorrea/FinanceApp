import Decimal from "decimal.js";

/** Safe formatting for UI — avoid floating point artifacts. */
export function formatMoney(
  value: Decimal.Value,
  currency = "USD",
  locale?: string,
): string {
  const n = new Decimal(value).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(value: Decimal.Value, fractionDigits = 2): string {
  const n = new Decimal(value).mul(100).toNumber();
  return `${n.toFixed(fractionDigits)}%`;
}
