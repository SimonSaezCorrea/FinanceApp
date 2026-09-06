import type { reference } from "@finance/contracts";
import { currencySymbol as intlCurrencySymbol, formatMoney, toMoney } from "@finance/money";

/**
 * A currency's display symbol, DB-first: `Currency.symbol` (see its own doc
 * comment in `schema.prisma`) wins whenever it's set, since it isn't tied to
 * the UI's own locale the way `Intl.NumberFormat` is — a new currency row
 * with a symbol shows up correctly everywhere with no code change, which is
 * what lets this app grow past its 3-currency MVP without `currencySymbol`
 * growing a new special case per market.
 *
 * Falls back to `@finance/money`'s own `currencySymbol` (Intl-derived, scoped
 * to CLP/USD today) when the currency isn't in `currencies` yet (still
 * loading, or a code the reference table doesn't know) — never a blank glyph.
 */
export function resolveCurrencySymbol(
  code: string,
  currencies: Pick<reference.Currency, "code" | "symbol">[] | undefined,
  locale: string,
): string {
  const stored = currencies?.find((c) => c.code === code)?.symbol;
  return stored ?? intlCurrencySymbol(code, locale);
}

/**
 * A formatted money string that reads correctly even for a currency
 * `Intl.NumberFormat` doesn't actually know a symbol for (CLF/UF today) —
 * `@finance/money`'s own `formatMoney` doesn't throw for those, it just
 * echoes the bare ISO code back with the raw 4-decimal storage scale still
 * attached ("CLF 5.000.000,0000"), which is what showed up wrong in the
 * account preview card. Detected by asking Intl the same question this app's
 * `currencySymbol` already answers: did it resolve a REAL symbol, or just
 * hand the code back? A currency Intl doesn't know is grouped by hand instead
 * (integer digits only — this is a preview figure, not a computation) with
 * whatever symbol IS on record for it (falling back to the bare code, same as
 * before this existed, when there's genuinely none).
 */
export function formatMoneyDisplay(
  amount: string,
  code: string,
  currencies: Pick<reference.Currency, "code" | "symbol">[] | undefined,
  locale: string,
): string {
  const resolvedLocale = locale === "es" ? "es-CL" : locale;
  const intlPart = new Intl.NumberFormat(resolvedLocale, { style: "currency", currency: code })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value;
  if (intlPart !== code) {
    return formatMoney(amount, { currency: code, locale });
  }
  const symbol = resolveCurrencySymbol(code, currencies, locale);
  const grouped = new Intl.NumberFormat(resolvedLocale, { maximumFractionDigits: 0 }).format(
    toMoney(amount).toNumber(),
  );
  return `${symbol} ${grouped}`;
}
