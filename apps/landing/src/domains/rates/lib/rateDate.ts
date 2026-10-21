import type { ExchangeRate } from "@finance/contracts/exchange-rate-rules";

import type { Language } from "../../../lib/language";
import { isIsoDay } from "./chileDay";

/** The chosen day travels in the address (spec 033, clarify Q4), never in the canonical. */
export const DATE_PARAM: Record<Language, string> = { es: "fecha", en: "date" };

export type DateNotice = "invalid" | "future" | null;

/** The day a link asks for. `day: null` = today; a bad or future day falls back to today with a
 * notice to show. A day before the first recording is left to `lookupDay` ("sin dato"). */
export function readDateParam(
  search: string,
  lang: Language,
  today: string,
): { day: string | null; notice: DateNotice } {
  const value = new URLSearchParams(search).get(DATE_PARAM[lang]);
  if (value === null || value === "") return { day: null, notice: null };
  if (!isIsoDay(value)) return { day: null, notice: "invalid" };
  if (value > today) return { day: null, notice: "future" };
  return { day: value, notice: null };
}

/** `href` with the language's date parameter set to `day` (removed when null). */
export function withDateParam(href: string, lang: Language, day: string | null): string {
  const url = new URL(href);
  if (day) url.searchParams.set(DATE_PARAM[lang], day);
  else url.searchParams.delete(DATE_PARAM[lang]);
  return url.toString();
}

/**
 * The row of `day` among the rows a page carries (one currency): found, absent ("sin dato"), or
 * older than the page's window but recorded (`needsFetch`: ask the API for that one day).
 */
export function lookupDay(
  rows: readonly ExchangeRate[],
  day: string,
  first: string | null,
): { row: ExchangeRate | null; needsFetch: boolean } {
  if (first === null || day < first) return { row: null, needsFetch: false };
  const row = rows.find((r) => r.date === day) ?? null;
  if (row) return { row, needsFetch: false };
  let oldest: string | null = null;
  for (const r of rows) if (oldest === null || r.date < oldest) oldest = r.date;
  return { row: null, needsFetch: oldest !== null && day < oldest };
}
