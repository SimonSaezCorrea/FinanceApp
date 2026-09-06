import type { accounts as accountsContract } from "@finance/contracts";

/**
 * "Corriente · Banco de Chile · 001-2345678-90" — an account's type, institution
 * and number, joined and with any missing part (e.g. a CASH account has neither
 * institution nor number) simply omitted. Shared by every place that needs to
 * tell two accounts apart beyond their own name: a debt's "Cuenta asociada"
 * detail row and its picker (`DebtFormPanel`) both read this, so a selector and
 * its own read-only display can't drift into two different formats.
 */
export function accountMetaLine(
  account: accountsContract.BankAccount,
  typeLabel: (type: accountsContract.AccountType) => string,
): string {
  return [typeLabel(account.type), account.institution, account.accountNumber]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Same shape as `accountMetaLine`, but for a CARD: "Corriente · Banco de Chile ·
 * ····1234" — the card's own last4, never the bank account number. A card
 * already carries its account's type/institution (it can only ever belong to
 * one), so a picker that lists cards has no separate "cuenta" of its own to
 * name — this is the one line that identifies it.
 */
export function cardMetaLine(
  account: accountsContract.BankAccount,
  card: Pick<accountsContract.Card, "last4">,
  typeLabel: (type: accountsContract.AccountType) => string,
): string {
  return [typeLabel(account.type), account.institution, `···· ${card.last4}`]
    .filter(Boolean)
    .join(" · ");
}
