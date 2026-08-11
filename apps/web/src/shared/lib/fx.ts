import { toMoney } from "@finance/money";

/**
 * STATIC, APPROXIMATE exchange rates — units of CLP per 1 unit of the currency.
 *
 * This app has no FX provider: nothing fetches or stores live rates, and no
 * balance is ever *stored* converted. These values exist only to render the
 * "≈ $X CLP" hints next to foreign-currency amounts, so the user can eyeball a
 * multi-currency list. They drift with the market and must be updated by hand
 * (or replaced by a real rate source — see docs/PENDING.md).
 *
 * Never use a converted amount for a calculation that is persisted, validated
 * or compared against a limit.
 */
export const FX_TO_CLP: Record<string, number> = {
  CLP: 1,
  USD: 954.005,
  EUR: 1045,
};

/** Whether both currencies have a rate, so a hint can be shown at all. */
export function canConvert(from: string, to: string): boolean {
  return FX_TO_CLP[from] !== undefined && FX_TO_CLP[to] !== undefined;
}

/**
 * Approximate `amount` expressed in `to`. Returns null when either currency has
 * no rate (unknown currency) or when there's nothing to convert (same currency).
 */
export function convertApprox(amount: string, from: string, to: string): string | null {
  if (from === to) return null;
  const rateFrom = FX_TO_CLP[from];
  const rateTo = FX_TO_CLP[to];
  if (rateFrom === undefined || rateTo === undefined) return null;
  return toMoney(amount).times(rateFrom).dividedBy(rateTo).toString();
}
