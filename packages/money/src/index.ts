import Decimal from "decimal.js";

/**
 * Single source of truth for money handling across the monorepo.
 *
 * Money crosses the API boundary as a STRING (never a JS number) to preserve
 * precision (Constitution Principle I). Both apps parse with these helpers.
 *
 * Default scale is 4 decimal places, matching the DB `Decimal(18,4)` columns.
 */

export const MONEY_SCALE = 4;

export type MoneyInput = string | number | Decimal;

/** Parse a money value into a Decimal. Rejects non-finite / invalid input. */
export function toMoney(value: MoneyInput): Decimal {
  const d = new Decimal(value);
  if (!d.isFinite()) {
    throw new Error(`Invalid money value: ${String(value)}`);
  }
  return d;
}

/** Serialize a money value to a fixed-scale string for transport/storage. */
export function moneyToString(value: MoneyInput, scale: number = MONEY_SCALE): string {
  return toMoney(value).toFixed(scale, Decimal.ROUND_HALF_EVEN);
}

/** Sum a list of money values; returns a fixed-scale string. */
export function sumMoney(values: MoneyInput[], scale: number = MONEY_SCALE): string {
  const total = values.reduce<Decimal>((acc, v) => acc.plus(toMoney(v)), new Decimal(0));
  return total.toFixed(scale, Decimal.ROUND_HALF_EVEN);
}

/** Add two money values; returns a fixed-scale string. */
export function addMoney(a: MoneyInput, b: MoneyInput, scale: number = MONEY_SCALE): string {
  return toMoney(a).plus(toMoney(b)).toFixed(scale, Decimal.ROUND_HALF_EVEN);
}

/** Subtract b from a; returns a fixed-scale string. */
export function subtractMoney(a: MoneyInput, b: MoneyInput, scale: number = MONEY_SCALE): string {
  return toMoney(a).minus(toMoney(b)).toFixed(scale, Decimal.ROUND_HALF_EVEN);
}

/** Format a money value for display in a given locale/currency. */
export function formatMoney(
  value: MoneyInput,
  opts: { locale?: string; currency?: string } = {},
): string {
  const { locale = "es", currency = "USD" } = opts;
  const n = toMoney(value).toNumber();
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

export * from "./installments";
export * from "./interest";
