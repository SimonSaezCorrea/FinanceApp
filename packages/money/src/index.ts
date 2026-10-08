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

/** Minor-unit decimals of the MVP's currencies — pinned so a runtime's ICU data
 * can't change what an instalment is worth (the UF, CLF, is quoted to 4). */
const CURRENCY_SCALES: Record<string, number> = { CLP: 0, USD: 2, CLF: 4 };

/**
 * How many decimals an amount in `currency` can really have: a peso has no
 * cents, so an instalment of "21.663,3333" is money nobody can transfer. Any
 * other ISO code falls back to its ISO 4217 minor unit; an unknown one to
 * MONEY_SCALE, which never rounds anything away.
 */
export function currencyScale(currency: string): number {
  const pinned = CURRENCY_SCALES[currency.toUpperCase()];
  if (pinned !== undefined) return pinned;
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? MONEY_SCALE
    );
  } catch {
    return MONEY_SCALE;
  }
}

/**
 * Format a money value for display in a given locale/currency.
 *
 * The bare "es" locale has no currency-symbol mapping for CLP in ICU's data —
 * `Intl.NumberFormat("es", { style: "currency", currency: "CLP" })` falls back
 * to the ISO code ("95.000 CLP") instead of "$95.000". "es-CL" resolves it
 * correctly (and disambiguates USD as "US$", still with no FX conversion) —
 * a targeted fix rather than a region guess, since this app's `es` locale IS
 * Chilean Spanish (the MVP is Chile-only). CLF (the UF) has no ISO symbol at
 * all, in any locale, so it keeps showing its code — that's correct, not a bug.
 */
export function formatMoney(
  value: MoneyInput,
  opts: { locale?: string; currency?: string } = {},
): string {
  const { locale = "es", currency = "USD" } = opts;
  const n = toMoney(value).toNumber();
  const resolvedLocale = locale === "es" ? "es-CL" : locale;
  return new Intl.NumberFormat(resolvedLocale, { style: "currency", currency }).format(n);
}

/**
 * Just the currency glyph/prefix a `formatMoney` call would show ("$", "US$",
 * or the bare ISO code for CLF, which has none) — for an amount input that
 * shows the sign next to what the user types instead of only after saving.
 * Same "es" → "es-CL" resolution as `formatMoney`, so the two never disagree.
 */
export function currencySymbol(currency: string, locale: string = "es"): string {
  const resolvedLocale = locale === "es" ? "es-CL" : locale;
  const parts = new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency,
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

/**
 * Spec 030 — what `amount` is worth at `rate` (pesos per ONE unit of the amount's currency),
 * expressed in `toCurrency`, rounded to THAT currency's minor unit (a peso has no cents).
 *
 * The one conversion implementation: the web uses it to SUGGEST an editable figure (a USD
 * payment's pesos, a USD account's "≈ $…", the estimated net-worth total); the server never
 * persists a result of it that the person did not confirm. `rate` must be a positive number.
 */
export function convertAmount(amount: MoneyInput, rate: MoneyInput, toCurrency: string): string {
  const r = toMoney(rate);
  if (!r.isPositive() || r.isZero()) {
    throw new Error(`Invalid exchange rate: ${String(rate)}`);
  }
  return moneyToString(toMoney(amount).times(r), currencyScale(toCurrency));
}

export * from "./installments";
export * from "./interest";
