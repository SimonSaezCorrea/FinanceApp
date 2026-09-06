import type { reference } from "@finance/contracts";
import { currencySymbol as intlCurrencySymbol } from "@finance/money";

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
