/**
 * `card-limit` table — a CREDIT card's own independent sub-limit ("tope propio")
 * for ONE currency. Not an aggregate root: it only ever exists under a
 * `CardAccount`, which in turn only exists under a `BankAccount`. Writes must
 * therefore go through the `BankAccount` aggregate, which is what validates
 * `CARD_SUBLIMIT_EXCEEDS_ACCOUNT` / `CARD_LIMIT_REQUIRED` — this domain owns the
 * table's shape and persistence, never the rules about when a limit is legal.
 */
export interface CardLimitProps {
  id: string;
  currency: string;
  /** moneyString */
  limitAmount: string;
  /** moneyString — the seed baseline; `used` is derived from transactions. */
  usedInitial: string;
}

/** A limit row about to be inserted (no id yet — Prisma's `@default(cuid())`). */
export type CardLimitPlan = Omit<CardLimitProps, "id">;
