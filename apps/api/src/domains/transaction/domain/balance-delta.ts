import type { accounts } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

/**
 * How a movement moves its account's cash balance: income adds, expense
 * subtracts. The inverse of a movement is just its negated delta, which is what
 * an edit or a delete applies to undo the old one.
 *
 * Kept in one place because it is the definition `currentBalance` rests on
 * (`initialBalance + Σincome − Σexpense`): two spellings of it would eventually
 * disagree, and a balance nobody can reconcile by hand any more has to be right.
 */
export function balanceDelta(type: "INCOME" | "EXPENSE", amount: string): string {
  return type === "INCOME" ? amount : subtractMoney("0", amount);
}

/** Undo a movement's effect on the balance. */
export function reverseBalanceDelta(type: "INCOME" | "EXPENSE", amount: string): string {
  return subtractMoney("0", balanceDelta(type, amount));
}

/**
 * Whether a movement is charged to a credit line instead of to cash: any
 * movement on a standalone `CREDIT_CARD` account (every one of them is a credit
 * one by construction), and any movement made with a CREDIT-kind card on an
 * account that merely grew one.
 */
export function isChargedToCredit(
  account: { type: accounts.AccountType } | null,
  card: { kind: accounts.CardKind } | null,
): boolean {
  return account?.type === "CREDIT_CARD" || card?.kind === "CREDIT";
}

/**
 * How a movement moves CASH, which is not the same question as what it costs.
 * Buying with a credit card moves no money: the purchase raises `creditUsed`
 * and the cash leaves the account later, once, when the statement is paid (that
 * payment is its own EXPENSE movement on the paying account). Charging the
 * balance at purchase time AND again at payment time would count the same
 * spending twice — and charge it to whichever account carries the card, which
 * need not even be the one that ends up paying.
 */
export function cashDelta(
  type: "INCOME" | "EXPENSE",
  amount: string,
  account: { type: accounts.AccountType } | null,
  card: { kind: accounts.CardKind } | null,
): string {
  return isChargedToCredit(account, card) ? "0" : balanceDelta(type, amount);
}

/** Undo a movement's effect on cash. Kept as its own branch rather than negating
 * `cashDelta` so a no-op stays the literal "0" instead of a formatted "-0.0000":
 * call sites test deltas for zero to skip the write entirely. */
export function reverseCashDelta(
  type: "INCOME" | "EXPENSE",
  amount: string,
  account: { type: accounts.AccountType } | null,
  card: { kind: accounts.CardKind } | null,
): string {
  return isChargedToCredit(account, card) ? "0" : reverseBalanceDelta(type, amount);
}
