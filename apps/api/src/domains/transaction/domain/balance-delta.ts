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
 * How a movement moves the ACCOUNT's balance, given the card it was made with.
 *
 * A PREPAID card is the one case where a movement on an account leaves that
 * account's balance alone: the money left it when the card was loaded (a real
 * EXPENSE of its own), and spending afterwards draws down the card's own pot.
 * Counting both would subtract the same money twice.
 */
export function accountBalanceDelta(
  type: "INCOME" | "EXPENSE",
  amount: string,
  cardKind: "CREDIT" | "DEBIT" | "PREPAID" | null | undefined,
): string {
  if (cardKind === "PREPAID" && type === "EXPENSE") return "0";
  return balanceDelta(type, amount);
}
