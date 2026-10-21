import { toMoney } from "@finance/money";

import type { Language } from "../../../lib/language";
import { groupDecimal } from "./typing";

/**
 * The indicator pages' converter (spec 033, FR-010/FR-011). Loaded on the first keystroke (it
 * brings `decimal.js`), never on arrival.
 *
 * Full precision (clarified 2026-10-21): any number of decimals can be typed, and the result is
 * NOT rounded to the currency's minor unit (unlike the app's editable suggestion, which must be a
 * payable amount). Unit to pesos is the exact product; pesos to unit is a division that rarely
 * ends, so it keeps `decimal.js`'s 20 significant digits. Trailing zeros are dropped and a result
 * is never written with an exponent.
 */

/** A typed amount as a plain decimal string, read in the page's language; null when it isn't a
 * positive number. */
export function parseAmount(input: string, lang: Language): string | null {
  let s = input.replace(/\s/g, "");
  if (!s) return null;
  if (lang === "es") {
    // A single dot not followed by exactly three digits is a decimal point typed the English way
    // ("1.5" is 1,5); "500.000" and "1.234.567" stay thousands, as written in Chile.
    const englishDecimal = !s.includes(",") && /^\d+\.(\d{1,2}|\d{4,})$/.test(s);
    s = englishDecimal ? s : s.replace(/\./g, "").replace(",", ".");
  } else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return toMoney(s).isZero() ? null : s;
}

/** `amount` units in pesos (`value` = pesos per unit). */
export function toPesos(amount: string, value: string): string {
  return toMoney(amount).times(value).toFixed();
}

/** `pesos` in units of the currency (`value` = pesos per unit). */
export function fromPesos(pesos: string, value: string): string {
  return toMoney(pesos).div(value).toFixed();
}

/** A result for an input field: the integer part grouped for the language, every decimal kept. */
export function formatAmountInput(value: string, lang: Language): string {
  return groupDecimal(value, lang);
}
