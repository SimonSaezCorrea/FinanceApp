import type { accounts, transactions } from "@finance/contracts";
import { moneyToString, subtractMoney } from "@finance/money";

/** Signed effect of a movement on its account's cash balance. */
function delta(tx: transactions.Transaction): string {
  return tx.type === "INCOME" ? tx.amount : `-${tx.amount}`;
}

export interface BalanceAfterInput {
  /** The loaded movements, newest first — exactly what the list renders. */
  items: transactions.Transaction[];
  /** Index of the movement being looked at. */
  index: number;
  account: Pick<accounts.BankAccount, "type" | "currentBalance"> | undefined;
  /** Whether a `from`/`to` filter is active. */
  dateFiltered: boolean;
}

/**
 * Balance of the account right after the movement at `index`, walking back from
 * the account's current balance and undoing every newer movement's delta.
 *
 * Deliberately returns `null` rather than an approximation (research D6): the
 * figure is only trustworthy when the account carries a balance, no date filter
 * hides newer movements, and every newer loaded row belongs to that same
 * account. Any other case shows no row at all.
 */
export function balanceAfterTransaction({
  items,
  index,
  account,
  dateFiltered,
}: BalanceAfterInput): string | null {
  if (!account) return null;
  // A credit line has no cash balance to speak of — only a pool.
  if (account.type === "CREDIT_LINE") return null;
  if (dateFiltered) return null;
  if (index < 0 || index >= items.length) return null;

  const newer = items.slice(0, index);
  const target = items[index];
  if (!target) return null;
  // A mixed list (the Movements view across accounts) hides deltas of this
  // account behind other accounts' rows; we can't reconstruct the running total.
  if (newer.some((tx) => tx.bankAccountId !== target.bankAccountId)) return null;

  let balance = moneyToString(account.currentBalance);
  for (const tx of newer) balance = subtractMoney(balance, delta(tx));
  return balance;
}
