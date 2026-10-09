import { exchangeRates } from "@finance/contracts";
import { toMoney } from "@finance/money";

type Rate = exchangeRates.ExchangeRate;

export interface RangeStats {
  /** The earliest row of the range. */
  first: Rate;
  /** The latest row of the range: the value "now" for the period shown. */
  last: Rate;
  /** The row before `last` (the day before), or null with a single row. */
  previous: Rate | null;
  min: Rate;
  max: Rate;
  /** Average of the range's daily values, two decimals, as a decimal string. */
  average: string;
  /** `last - first`, as a decimal string. */
  change: string;
  /** `(last - first) / first × 100`, as a decimal string. */
  changePercent: string;
  /**
   * Average size of a move between two consecutive PUBLISHED values (carried days repeat the
   * previous value and would dilute it), or null with fewer than two publications.
   */
  averageDailyMove: string | null;
}

/**
 * Summary of ONE currency's rows over a range, in decimal arithmetic (never JS floats). Null with
 * fewer than one row. Ties for min/max keep the earliest day.
 */
export function rangeStats(rows: readonly Rate[]): RangeStats | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  let min = first;
  let max = first;
  let total = toMoney(0);
  for (const r of sorted) {
    const v = toMoney(r.value);
    if (v.lessThan(min.value)) min = r;
    if (v.greaterThan(max.value)) max = r;
    total = total.plus(v);
  }
  const change = toMoney(last.value).minus(first.value);

  const published = sorted.filter((r) => !exchangeRates.isCarried(r));
  let moves = toMoney(0);
  for (let i = 1; i < published.length; i++) {
    moves = moves.plus(
      toMoney(published[i]!.value)
        .minus(published[i - 1]!.value)
        .abs(),
    );
  }

  return {
    first,
    last,
    previous: sorted.length > 1 ? sorted[sorted.length - 2]! : null,
    min,
    max,
    average: total.dividedBy(sorted.length).toFixed(2),
    change: change.toFixed(2),
    changePercent: change.dividedBy(first.value).times(100).toFixed(2),
    averageDailyMove:
      published.length > 1 ? moves.dividedBy(published.length - 1).toFixed(2) : null,
  };
}

/** The difference between two rates, absolute and in percent of the first. */
export function rateChange(from: string, to: string): { change: string; percent: string } {
  const change = toMoney(to).minus(from);
  return {
    change: change.toFixed(2),
    percent: change.dividedBy(from).times(100).toFixed(2),
  };
}
