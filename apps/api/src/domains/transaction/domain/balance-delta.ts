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
