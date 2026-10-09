import { formatRate } from "./formatRate";

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
