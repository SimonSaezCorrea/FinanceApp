import Decimal from "decimal.js";

import type { transactions } from "@finance/contracts";

export interface CurrencyKpi {
  currency: string;
  totalIncome: string;
  totalExpense: string;
  netBalance: string;
}

export interface TransactionViewFilters {
  type?: transactions.TransactionType;
  bankAccountId?: string;
  from?: string;
  to?: string;
  categorySearch: string;
  selectedCardId?: string;
  showInactiveAccounts: boolean;
}

const SCALE = 4;
const ROUND = Decimal.ROUND_HALF_EVEN;

/**
 * The API's per-currency income/expense totals, plus the derived net balance.
 *
 * These totals are summed in the database, not here: the movements list is
 * paginated, so folding the rows currently in the browser would report the KPIs
 * of whatever the user had scrolled past rather than of the filtered set.
 */
export function toCurrencyKpis(
  totals: transactions.TransactionSummary["currencyTotals"],
): CurrencyKpi[] {
  return totals.map(({ currency, income, expense }) => {
    const inc = new Decimal(income);
    const exp = new Decimal(expense);
    return {
      currency,
      totalIncome: inc.toFixed(SCALE, ROUND),
      totalExpense: exp.toFixed(SCALE, ROUND),
      netBalance: inc.minus(exp).toFixed(SCALE, ROUND),
    };
  });
}

export function isFullMonthRange(from: string | undefined, to: string | undefined): boolean {
  if (!from || !to) return false;
  const anchor = new Date(from);
  return from === startOfMonth(anchor) && to === endOfMonth(anchor);
}

export function startOfMonth(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  return d.toISOString();
}

export function endOfMonth(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return d.toISOString();
}
