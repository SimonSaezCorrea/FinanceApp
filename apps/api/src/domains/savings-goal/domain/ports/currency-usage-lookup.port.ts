export const SAVINGS_GOAL_CURRENCY_USAGE = Symbol("SAVINGS_GOAL_CURRENCY_USAGE");

/**
 * Minimal read port over the `savings-goal` table for domains that need to
 * know whether a currency is still in use by the caller before letting them
 * remove it from a preference (specs/020: `user.extraCurrencies` can't drop a
 * currency some record still uses).
 */
export interface CurrencyUsageLookupPort {
  isCurrencyInUse(userId: string, currency: string): Promise<boolean>;
}
