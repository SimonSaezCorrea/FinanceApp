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

export function summarizeByCurrency(txs: transactions.Transaction[]): CurrencyKpi[] {
  const map = new Map<string, { income: Decimal; expense: Decimal }>();

  for (const tx of txs) {
    if (!map.has(tx.currency)) {
      map.set(tx.currency, { income: new Decimal(0), expense: new Decimal(0) });
    }
    const entry = map.get(tx.currency)!;
    const amount = new Decimal(tx.amount);
    if (tx.type === "INCOME") {
      entry.income = entry.income.plus(amount);
    } else {
      entry.expense = entry.expense.plus(amount);
    }
  }

  return Array.from(map.entries()).map(([currency, { income, expense }]) => {
    const net = income.minus(expense);
    return {
      currency,
      totalIncome: income.toFixed(SCALE, ROUND),
      totalExpense: expense.toFixed(SCALE, ROUND),
      netBalance: net.toFixed(SCALE, ROUND),
    };
  });
}

export function uniqueCategories(txs: transactions.Transaction[]): string[] {
  const set = new Set<string>();
  for (const tx of txs) {
    if (tx.category) set.add(tx.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function clientFilter(
  txs: transactions.Transaction[],
  search: string,
): transactions.Transaction[] {
  if (!search.trim()) return txs;
  const lower = search.toLowerCase();
  return txs.filter((tx) => tx.category?.toLowerCase().includes(lower) ?? false);
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
