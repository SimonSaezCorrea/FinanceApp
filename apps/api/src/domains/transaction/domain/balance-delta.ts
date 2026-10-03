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
  // A CREDIT_CARD account has no cash at all, so every movement on it — a purchase
  // with one of its cards or an issuer charge with no card — is charged to credit.
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

/** One account move a transfer leg causes: its cash balance, or — on a credit
 * card account, which has no cash — its credit pool (`pool`). */
export interface LegDelta {
  accountId: string;
  delta: string;
  pool?: boolean;
}

/**
 * What one leg of a transfer does to its account. A transfer INTO a credit card
 * account is paying the card: it lowers `creditUsed` instead of adding cash, and
 * one OUT of it (a cash advance) raises it — exactly like any other income or
 * expense on that account. Either way it is still a transfer: money moving
 * between the user's own accounts, never income or spending.
 */
export function transferLegDelta(
  type: "INCOME" | "EXPENSE",
  amount: string,
  account: { id: string; type: string },
): LegDelta {
  if (account.type === "CREDIT_CARD") {
    return { accountId: account.id, delta: reverseBalanceDelta(type, amount), pool: true };
  }
  return { accountId: account.id, delta: balanceDelta(type, amount) };
}

/** Undo a transfer leg's effect on its account. */
export function reverseTransferLegDelta(
  type: "INCOME" | "EXPENSE",
  amount: string,
  account: { id: string; type: string },
): LegDelta {
  const leg = transferLegDelta(type, amount, account);
  return { ...leg, delta: subtractMoney("0", leg.delta) };
}
