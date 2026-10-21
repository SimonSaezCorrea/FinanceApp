import { convertAmount, currencyScale, toMoney } from "@finance/money";

import type { Language } from "../../../lib/language";

/**
 * The indicator pages' converter (spec 033, FR-010/FR-011). Loaded on the first keystroke (it
 * brings `decimal.js`), never on arrival.
 *
 * Unit to pesos is the app's own `convertAmount` (SC-003). Pesos to unit, which the app doesn't
 * offer, is the same function with the inverse rate, rounded to the unit's precision.
 */

/** A typed amount as a plain decimal string, read in the page's language; null when it isn't a
 * positive number. */
export function parseAmount(input: string, lang: Language): string | null {
  let s = input.replace(/\s/g, "");
  if (!s) return null;
  if (lang === "es") s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return toMoney(s).isZero() ? null : s;
}

/** `amount` units in pesos. */
export function toPesos(amount: string, value: string): string {
  return convertAmount(amount, value, "CLP");
}

/** `pesos` in units of `currency` (`value` = pesos per unit). */
export function fromPesos(pesos: string, value: string, currency: "USD" | "CLF"): string {
  return convertAmount(pesos, toMoney(1).div(value), currency);
}

/** A result for an input field: grouped for the language, only the decimals the currency has. */
export function formatAmountInput(value: string, currency: string, lang: Language): string {
  return new Intl.NumberFormat(lang === "es" ? "es-CL" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyScale(currency),
  }).format(value as unknown as number);
}
