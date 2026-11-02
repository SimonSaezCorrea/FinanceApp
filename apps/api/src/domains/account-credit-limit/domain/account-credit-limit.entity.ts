/**
 * `account-credit-limit` table (spec 039) — a credit card ACCOUNT's credit in a currency
 * other than its own (USD on a CLP card). Every card of the account spends from it: the
 * primary uses 100%, an additional card may carry a `CardLimit` (sub-limit) within it. Not an
 * aggregate root: it only exists under a `BankAccount`, whose aggregate validates it — this
 * domain owns the table's shape and persistence, never the rules about when a line is legal.
 */
export interface AccountCreditLimitProps {
  id: string;
  currency: string;
  /** moneyString */
  limitAmount: string;
  /** moneyString — debt owed before the first movement; `used` is derived from movements. */
  usedInitial: string;
}

/** A credit line about to be written (no id yet — `@default(uuid(7))`). */
export type AccountCreditLimitPlan = Omit<AccountCreditLimitProps, "id">;
