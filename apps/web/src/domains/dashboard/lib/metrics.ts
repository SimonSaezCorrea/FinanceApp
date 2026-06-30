import type { accounts, debts, installments, recurring, transactions } from "@finance/contracts";
import { sumMoney } from "@finance/money";

/** No FX rates available — the dashboard aggregates only the primary currency. */
export const PRIMARY_CURRENCY = "CLP";

/** Net worth = Σ currentBalance of primary-currency accounts, plus its per-day series + % change. */
export function netWorth(list: accounts.BankAccount[]): {
  total: string;
  series: string[];
  changePct: number | null;
} {
  const primary = list.filter((a) => a.currency === PRIMARY_CURRENCY);
  const total = sumMoney(primary.map((a) => a.currentBalance));
  const points = primary[0]?.balanceSeries.length ?? 0;
  const series = Array.from({ length: points }, (_, i) =>
    sumMoney(primary.map((a) => a.balanceSeries[i] ?? "0")),
  );
  const first = Number(series[0] ?? 0);
  const last = Number(series.at(-1) ?? 0);
  const changePct = points >= 2 && first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null;
  return { total, series, changePct };
}

/** Other-currency balances (chips alongside the primary hero). */
export function secondaryTotals(
  list: accounts.BankAccount[],
): { currency: string; total: string }[] {
  const map = new Map<string, string[]>();
  for (const a of list) {
    if (a.currency === PRIMARY_CURRENCY) continue;
    const bucket = map.get(a.currency) ?? [];
    bucket.push(a.currentBalance);
    map.set(a.currency, bucket);
  }
  return [...map.entries()].map(([currency, vals]) => ({ currency, total: sumMoney(vals) }));
}

/** ISO timestamp for the first day of the current month (local). */
export function startOfMonthISO(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export interface MonthFlow {
  income: string;
  expense: string;
  savingsRate: number; // 0..1
}

/** Income/expense totals (primary currency) for the given transactions. */
export function monthFlow(txs: transactions.Transaction[]): MonthFlow {
  const primary = txs.filter((t) => t.currency === PRIMARY_CURRENCY);
  const income = sumMoney(primary.filter((t) => t.type === "INCOME").map((t) => t.amount));
  const expense = sumMoney(primary.filter((t) => t.type === "EXPENSE").map((t) => t.amount));
  const inc = Number(income);
  const exp = Number(expense);
  const savingsRate = inc > 0 ? Math.max(0, (inc - exp) / inc) : 0;
  return { income, expense, savingsRate };
}

export interface CategorySlice {
  category: string | null;
  total: string;
}

/** Expenses (primary currency) grouped by category, largest first. */
export function expensesByCategory(txs: transactions.Transaction[]): CategorySlice[] {
  const map = new Map<string | null, string[]>();
  for (const t of txs) {
    if (t.type !== "EXPENSE" || t.currency !== PRIMARY_CURRENCY) continue;
    const key = t.category ?? null;
    const bucket = map.get(key) ?? [];
    bucket.push(t.amount);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([category, vals]) => ({ category, total: sumMoney(vals) }))
    .sort((a, b) => Number(b.total) - Number(a.total));
}

export type UpcomingKind = "installment" | "debt" | "recurring";

export interface UpcomingPayment {
  id: string;
  label: string;
  date: string;
  amount: string;
  currency: string;
  kind: UpcomingKind;
}

/** Soonest unpaid installment per plan + unsettled debts + active recurring expenses, sorted by date. */
export function upcomingPayments(
  plans: installments.InstallmentPlan[],
  debtList: debts.Debt[],
  recurrings: recurring.RecurringExpense[],
  now: Date,
  limit = 5,
): UpcomingPayment[] {
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: UpcomingPayment[] = [];

  for (const plan of plans) {
    const next = plan.payments
      .filter((p) => p.paidAt === null && new Date(p.dueDate).getTime() >= todayMs)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    if (next) {
      out.push({
        id: next.id,
        label: plan.title,
        date: next.dueDate,
        amount: next.amount,
        currency: plan.currency,
        kind: "installment",
      });
    }
  }

  for (const debt of debtList) {
    if (debt.settledAt !== null || debt.dueAt === null) continue;
    if (new Date(debt.dueAt).getTime() < todayMs) continue;
    out.push({
      id: debt.id,
      label: debt.counterparty,
      date: debt.dueAt,
      amount: debt.principal,
      currency: debt.currency,
      kind: "debt",
    });
  }

  for (const rec of recurrings) {
    if (!rec.active) continue;
    if (new Date(rec.nextDueAt).getTime() < todayMs) continue;
    out.push({
      id: rec.id,
      label: rec.label,
      date: rec.nextDueAt,
      amount: rec.amount,
      currency: rec.currency,
      kind: "recurring",
    });
  }

  return out
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, limit);
}
