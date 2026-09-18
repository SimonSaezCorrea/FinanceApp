export const CARD_LIMIT_CURRENCY_USAGE = Symbol("CARD_LIMIT_CURRENCY_USAGE");

/**
 * Minimal read port over the `card-limit` table for domains that need to
 * know whether a currency is still in use by the caller before letting them
 * remove it from a preference (specs/020: `user.extraCurrencies` can't drop a
 * currency some record still uses). Scoped by `userId` through the owning
 * `CardAccount`, since `CardLimit` itself carries no `userId` column.
 */
export interface CurrencyUsageLookupPort {
  isCurrencyInUse(userId: string, currency: string): Promise<boolean>;
}
