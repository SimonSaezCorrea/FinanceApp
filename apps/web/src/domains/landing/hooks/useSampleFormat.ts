import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

/**
 * Formatting for the landing's sample figures — the same `formatMoney` and locale-aware dates
 * the real screens use, so an English reader sees "$486,190" and "Aug 20, 2026" instead of a
 * hardcoded Chilean string. Every figure on these pages is example data.
 */
export function useSampleFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return {
    money: (value: number, currency = "CLP") => formatMoney(value, { locale, currency }),
    signed: (value: number, currency = "CLP") =>
      `${value < 0 ? "−" : "+"}${formatMoney(Math.abs(value), { locale, currency })}`,
    percent: (value: number) =>
      `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 1 })}%`,
    date: (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    dayMonth: (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }),
    monthYear: (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { month: "short", year: "numeric" }),
  };
}
