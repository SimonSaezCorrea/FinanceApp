import type { SimulationCurrency, SimulationIssue } from "@finance/money/installment-simulation";

import type { Language } from "../../../lib/language";
import { groupDecimal } from "../../../lib/typing";

/**
 * Spec 034 — reading and writing the simulator's numbers. No `decimal.js` here: this runs on every
 * keystroke from the first one, before the arithmetic module has loaded. Amounts arrive as decimal
 * strings already rounded by `@finance/money/installment-simulation`; this only writes them.
 */

/** Decimals each currency is written with (same as `currencyScale`). */
export const CURRENCY_DECIMALS: Record<SimulationCurrency, number> = { CLP: 0, USD: 2, CLF: 4 };

/** The sign written before an amount: "$" for pesos, "US$" for dollars, "UF " for the UF. */
export const CURRENCY_PREFIX: Record<SimulationCurrency, string> = {
  CLP: "$",
  USD: "US$",
  CLF: "UF ",
};

const LOCALE: Record<Language, string> = { es: "es-CL", en: "en-US" };

function formatNumber(value: string, lang: Language, decimals: number): string {
  // A decimal string, not a float: Intl formats it exactly (no binary rounding of the amount).
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value as unknown as number);
}

/** "$53.558", "US$1,200.50", "UF 100,0000". */
export function formatAmount(value: string, currency: SimulationCurrency, lang: Language): string {
  const negative = value.trim().startsWith("-");
  const digits = negative ? value.trim().slice(1) : value.trim();
  const text = CURRENCY_PREFIX[currency] + formatNumber(digits, lang, CURRENCY_DECIMALS[currency]);
  return negative ? `-${text}` : text;
}

/** "24,00 %" in Spanish, "24.00%" in English. */
export function formatPercent(value: string, lang: Language, decimals = 2): string {
  const number = formatNumber(value, lang, decimals);
  return lang === "es" ? `${number} %` : `${number}%`;
}

/** What a field holds, as a plain decimal string ("300000", "1.89"); "" when empty. Text that is
 * not a number is returned as typed, so `validateSimulationInput` reports it as invalid. */
export function parseField(input: string, lang: Language): string {
  let s = input.replace(/\s/g, "").replace(/^(US\$|UF|\$)/i, "");
  if (!s) return "";
  if (lang === "es") {
    // Same rule as the converter (spec 033): a single dot not followed by exactly three digits is
    // a decimal point typed the English way ("1.5"); "300.000" stays thousands.
    const englishDecimal = !s.includes(",") && /^\d+\.(\d{1,2}|\d{4,})$/.test(s);
    s = englishDecimal ? s : s.replace(/\./g, "").replace(",", ".");
  } else s = s.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? s : input.trim();
}

/** A plain decimal written the way the field shows it ("300000" → "300.000"). */
export function toInputText(plain: string, lang: Language): string {
  return groupDecimal(plain, lang);
}

export interface IssueMessage {
  key: string;
  params: Record<string, string | number>;
}

const E = "landing.simulator.errors";

/** The message for a field issue, as an i18n key and its values. */
export function issueMessage(issue: SimulationIssue, currency: SimulationCurrency): IssueMessage {
  const msg = (name: string, params: IssueMessage["params"] = {}) => ({
    key: `${E}.${name}`,
    params,
  });
  switch (issue.code) {
    case "required":
      return msg("required");
    case "invalid":
      return msg(issue.field === "installments" ? "integer" : "invalid");
    case "tooLow":
      return msg(
        issue.field === "monthlyRatePercent" ||
          issue.field === "stampTaxPercent" ||
          issue.field === "fee"
          ? "notNegative"
          : "positive",
      );
    case "tooHigh":
      if (issue.field === "installments") return msg("maxInstallments", { max: 60 });
      if (issue.field === "monthlyRatePercent") return msg("maxRate", { max: "10" });
      if (issue.field === "stampTaxPercent") return msg("maxTax", { max: "5" });
      return msg("maxAmount");
    case "tooManyDecimals":
      if (issue.field === "monthlyRatePercent") return msg("decimals", { count: 4 });
      return CURRENCY_DECIMALS[currency] === 0
        ? msg("noDecimals")
        : msg("decimals", { count: CURRENCY_DECIMALS[currency] });
    case "aboveCashLimit":
      return msg("aboveCash");
  }
}
