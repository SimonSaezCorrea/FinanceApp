/** One row of a credit card's limits in another currency, as typed. */
export interface CurrencyLimitDraft {
  currency: string;
  limitAmount: string;
}

/** The rows worth saving: another currency, with an amount. */
export function cleanExtraLimits(
  limits: CurrencyLimitDraft[],
  accountCurrency: string,
): CurrencyLimitDraft[] {
  return limits
    .filter((l) => l.currency !== accountCurrency && l.limitAmount.trim() !== "")
    .map((l) => ({ currency: l.currency, limitAmount: l.limitAmount }));
}
