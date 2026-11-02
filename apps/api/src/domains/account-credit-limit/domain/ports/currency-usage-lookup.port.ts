export const ACCOUNT_CREDIT_LIMIT_CURRENCY_USAGE = Symbol("ACCOUNT_CREDIT_LIMIT_CURRENCY_USAGE");

/**
 * Minimal read port over the `account-credit-limit` table for domains that need to know
 * whether a currency is still in use by the caller before letting them remove it from a
 * preference (specs/020). Scoped by `userId` through the owning `BankAccount`.
 */
export interface CurrencyUsageLookupPort {
  isCurrencyInUse(userId: string, currency: string): Promise<boolean>;
}
