import type { ExchangeRate } from "@finance/contracts/exchange-rate-rules";
import { toMoney } from "@finance/money";

export interface RateChange {
  /** The row it is compared with: the newest one before `current`, same currency. */
  previous: ExchangeRate;
  /** `current − previous`, pesos, two decimals. */
  change: string;
  /** `change / previous × 100`, two decimals. */
  percent: string;
}

/**
 * The change shown next to the value of the day (FR-002): against the previous RECORDED day of
 * that currency. A carried day repeats the value, so it reads as "sin cambio"; the first recorded
 * day has nothing to compare with (null). Exact decimal arithmetic, like the app's rates screen.
 */
export function rateChange(
  rows: readonly ExchangeRate[],
  current: ExchangeRate,
): RateChange | null {
  let previous: ExchangeRate | null = null;
  for (const r of rows) {
    if (r.currency !== current.currency || r.date >= current.date) continue;
    if (previous === null || r.date > previous.date) previous = r;
  }
  if (!previous) return null;
  const diff = toMoney(current.value).minus(previous.value);
  return {
    previous,
    change: diff.toFixed(2),
    percent: diff.div(previous.value).times(100).toFixed(2),
  };
}
