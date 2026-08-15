import type { accounts, transactions } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney } from "@finance/money";

function delta(type: transactions.TransactionType, amount: string): string {
  return type === "INCOME" ? amount : `-${amount}`;
}

type AccountLike = Pick<
  accounts.BankAccount,
  "id" | "type" | "currentBalance" | "creditLimit" | "creditUsed"
>;

export interface ProjectedBalanceInput {
  account: AccountLike | undefined;
  type: transactions.TransactionType;
  /** What the amount field currently holds; empty/invalid counts as zero. */
  amount: string;
  /** The movement being edited, if any — its old effect is undone first. */
  original?: Pick<transactions.Transaction, "type" | "amount" | "bankAccountId"> | null;
  /** The card the movement is drawn on, when it has one. */
  card?: Pick<accounts.Card, "kind"> | null;
}

export interface Projection {
  /**
   * `balance` — cash left in the account. `credit` — credit still available
   * (limit − used): on a credit line the money doesn't leave a balance, it eats
   * into the limit, so projecting a "saldo" there would describe the wrong
   * quantity entirely.
   */
  kind: "balance" | "credit";
  amount: string;
}

function cleanAmount(amount: string): string | null {
  const clean = amount.trim();
  if (!clean || Number.isNaN(Number(clean))) return null;
  return clean;
}

/** Whether this movement draws on the account's credit pool rather than its cash. */
function drawsOnCredit(account: AccountLike, card?: Pick<accounts.Card, "kind"> | null): boolean {
  // A standalone credit line has no cash at all; any other account only touches
  // the pool through a CREDIT-kind card.
  return account.type === "CREDIT_CARD" || card?.kind === "CREDIT";
}

/**
 * What the account looks like if this form is saved (FR-009) — either the cash
 * balance or, for a movement drawn on credit, the available credit.
 *
 * `null` when it can't be stated (no account, no usable amount): the row then
 * reads "—" rather than a figure nobody can stand behind.
 */
export function projectedAfterSave({
  account,
  type,
  amount,
  original,
  card,
}: ProjectedBalanceInput): Projection | null {
  if (!account) return null;
  const clean = cleanAmount(amount);
  if (clean === null) return null;

  if (drawsOnCredit(account, card)) {
    // An expense consumes credit; income on a credit line is a payment, which
    // gives it back. The limit itself doesn't move.
    const used = addMoney(account.creditUsed, type === "INCOME" ? `-${clean}` : clean);
    return { kind: "credit", amount: subtractMoney(account.creditLimit, used) };
  }

  let balance = moneyToString(account.currentBalance);
  // Editing: the movement's ORIGINAL effect is already baked into the balance —
  // undo it first, but only on the account that actually carries it (moving a
  // movement to another account leaves this one's history untouched).
  if (original && original.bankAccountId === account.id) {
    balance = subtractMoney(balance, delta(original.type, original.amount));
  }
  return { kind: "balance", amount: addMoney(balance, delta(type, clean)) };
}

/**
 * Cash-only projection, kept for callers that specifically mean the balance.
 * `null` for an account whose money lives in a credit pool.
 */
export function projectedBalance(input: ProjectedBalanceInput): string | null {
  const projection = projectedAfterSave(input);
  return projection?.kind === "balance" ? projection.amount : null;
}
