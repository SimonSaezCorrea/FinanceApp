import type { accounts } from "@finance/contracts";

/** Badge tone per billing-period status — one map for every surface that shows a
 * statement (list, detail, pay panel), so they can't drift. */
export const STATEMENT_STATUS_VARIANT = {
  OPEN: "info",
  PENDING: "warning",
  // Settled, but not for its full amount — success would overstate it.
  PARTIALLY_PAID: "warning",
  PAID: "success",
  // Spec 028: settled by the bank's conversion into the account's currency — final,
  // but not a payment the user made, so not "success" either.
  TRANSFERRED: "info",
} as const satisfies Record<accounts.CreditStatementStatus, string>;

/**
 * Spec 028: the account's periods grouped by currency — the account's own first,
 * then each other currency alphabetically. Within a group, the server's order.
 */
export function statementsByCurrency(
  statements: accounts.CreditStatement[],
  accountCurrency: string,
): { currency: string; statements: accounts.CreditStatement[] }[] {
  const currencies = [...new Set(statements.map((s) => s.currency))].sort((a, b) =>
    a === accountCurrency ? -1 : b === accountCurrency ? 1 : a.localeCompare(b),
  );
  return currencies.map((currency) => ({
    currency,
    statements: statements.filter((s) => s.currency === currency),
  }));
}
