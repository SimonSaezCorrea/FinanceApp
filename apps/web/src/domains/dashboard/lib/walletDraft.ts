import type { accounts } from "@finance/contracts";
import { wallet } from "@finance/contracts";

/** One wallet entry being edited: `a:<accountId>` or `c:<cardId>`, in display order. */
export type WalletKey = `a:${string}` | `c:${string}`;

export const accountKey = (id: string): WalletKey => `a:${id}`;
export const cardKey = (id: string): WalletKey => `c:${id}`;

/** The saved wallet as the draft the editor starts from. */
export function draftFrom(items: wallet.WalletItem[]): WalletKey[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((i) => (i.cardId ? cardKey(i.cardId) : accountKey(i.accountId!)));
}

/** Pick or unpick one entry. A new pick goes to the end; a full wallet refuses it. */
export function toggle(draft: WalletKey[], key: WalletKey): WalletKey[] {
  if (draft.includes(key)) return draft.filter((k) => k !== key);
  if (draft.length >= WALLET_MAX) return draft;
  return [...draft, key];
}

/** Move an entry one place earlier (-1) or later (+1). */
export function move(draft: WalletKey[], key: WalletKey, delta: -1 | 1): WalletKey[] {
  const from = draft.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.length) return draft;
  const next = [...draft];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** The body `PUT /wallet` takes. */
export function toReplaceBody(draft: WalletKey[]): wallet.ReplaceWallet {
  return {
    items: draft.map((k) =>
      k.startsWith("c:") ? { cardId: k.slice(2) } : { accountId: k.slice(2) },
    ),
  };
}

export const WALLET_MAX = wallet.WALLET_MAX_ITEMS;

/** What a key points at, resolved against the loaded accounts. */
export interface Resolved {
  key: WalletKey;
  account: accounts.BankAccount;
  card?: accounts.Card;
}

export function resolveKey(key: WalletKey, list: accounts.BankAccount[]): Resolved | null {
  if (key.startsWith("c:")) {
    const id = key.slice(2);
    const account = list.find((a) => a.cards.some((c) => c.id === id));
    const card = account?.cards.find((c) => c.id === id);
    return account && card ? { key, account, card } : null;
  }
  const account = list.find((a) => a.id === key.slice(2));
  return account ? { key, account } : null;
}

/**
 * A debit or prepaid card spends its account's own balance, so pinning it next to
 * that same account shows one balance twice. Not refused — the user may want the
 * plastic's look — only pointed out.
 */
export function duplicatedBalances(
  draft: WalletKey[],
  list: accounts.BankAccount[],
): { card: accounts.Card; account: accounts.BankAccount }[] {
  return draft
    .map((k) => resolveKey(k, list))
    .filter((r): r is Resolved => r !== null && r.card !== undefined)
    .filter((r) => r.card!.kind !== "CREDIT" && draft.includes(accountKey(r.account.id)))
    .map((r) => ({ card: r.card!, account: r.account }));
}
