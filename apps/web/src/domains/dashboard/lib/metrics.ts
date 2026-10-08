import type { accounts, debts, installments, recurring, transactions } from "@finance/contracts";
import { transactions as transactionsContract } from "@finance/contracts";
import { sumMoney } from "@finance/money";

import { netWorthByCurrency } from "../../accounts/lib/netWorth";
import { leftAmount } from "../../debts/lib/debtMetrics";

/** No FX rates available — the dashboard aggregates only the primary currency. */
export const PRIMARY_CURRENCY = "CLP";

/**
 * Net worth = what you have minus what you owe, in the primary currency — computed
 * by `netWorthByCurrency`, the same function Cuentas uses, so both screens agree:
 *   Σ saldo de las cuentas que guardan dinero (no las de tarjeta de crédito)
 *   − Σ creditUsed (deuda rotativa ya usada)
 *   − lo que queda por pagar de las deudas que YO debo (+ lo pendiente de las que
 *     me deben) — lo PENDIENTE, no el monto original: una deuda cobrada en parte
 *     solo vale lo que falta
 *
 * The credit pool is counted here and the installment plans are NOT: a plan bought
 * with a card already shows up as movements on its credit account, so adding it
 * again would count the same debt twice. A `Debt` row, on the other hand, is a
 * standalone loan or a personal one that no account reflects.
 *
 * `series` is that SAME net worth, one point per day for the last `SERIES_DAYS`
 * days, ending exactly at `total` (see `netWorthSeries`) — the chart and the hero
 * can never disagree.
 */
export function netWorth(
  list: accounts.BankAccount[],
  debtList: debts.Debt[] = [],
  recent: { txs: transactions.Transaction[]; now: Date } | null = null,
): {
  total: string;
  series: string[];
  changePct: number | null;
} {
  // The same figure Cuentas shows: one shared definition (`netWorthByCurrency`).
  const total = netWorthByCurrency(list, debtList, PRIMARY_CURRENCY)[0]!.net;
  const series = recent ? netWorthSeries(total, recent.txs, recent.now) : [];
  const first = Number(series[0] ?? 0);
  const last = Number(series.at(-1) ?? 0);
  const changePct =
    series.length >= 2 && first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null;
  return { total, series, changePct };
}

/** Days of history the net-worth chart covers (today included). */
export const SERIES_DAYS = 30;

/** First instant the net-worth chart needs movements from (local midnight). */
export function seriesStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (SERIES_DAYS - 1));
}

/**
 * Net worth at the end of each of the last `SERIES_DAYS` days, oldest first.
 *
 * Walks BACK from today's net worth (`netNow`): a day's point is `netNow` minus every
 * movement recorded after that day ended and up to now — an income raised net worth,
 * an expense lowered it, whatever account it was on (a purchase on a credit card is
 * debt, it counts the moment it happens). Today's point IS `netNow`; a future-dated
 * movement already counted in it is never undone.
 *
 * Left out: other currencies (never converted), movements with no account, and
 * internal flows that don't change net worth — transfers between own accounts,
 * paying or prepaying a card (`transactions.isInternalFlow`) and paying or
 * collecting a person-to-person debt (`debtId`: the cash and the debt move together).
 */
export function netWorthSeries(
  netNow: string,
  txs: transactions.Transaction[],
  now: Date,
): string[] {
  const nowMs = now.getTime();
  const relevant = txs.filter(
    (t) =>
      t.currency === PRIMARY_CURRENCY &&
      t.bankAccountId !== null &&
      t.debtId == null &&
      !transactionsContract.isInternalFlow(t),
  );
  return Array.from({ length: SERIES_DAYS }, (_, i) => {
    const day = SERIES_DAYS - 1 - i; // days before today
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
    const undo = relevant
      .filter((t) => {
        const at = new Date(t.occurredAt).getTime();
        return at >= endOfDay && at <= nowMs;
      })
      .map((t) => (t.type === "INCOME" ? `-${t.amount}` : t.amount));
    return sumMoney([netNow, ...undo]);
  });
}

/** Net worth in each other currency, unconverted (chips beside the primary hero) —
 * same definition as the hero and as Cuentas' chips. */
export function secondaryTotals(
  list: accounts.BankAccount[],
  debtList: debts.Debt[] = [],
): { currency: string; total: string }[] {
  return netWorthByCurrency(list, debtList, PRIMARY_CURRENCY)
    .filter((n) => n.currency !== PRIMARY_CURRENCY)
    .map((n) => ({ currency: n.currency, total: n.net }));
}

/** ISO timestamp for the first day of the given month (local). */
export function startOfMonthISO(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** ISO timestamp for the last instant of the given month (local). */
export function endOfMonthISO(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
}

export interface MonthFlow {
  income: string;
  expense: string;
  savingsRate: number; // 0..1
}

/**
 * Money moved between the user's own accounts — a transfer, or paying a credit
 * card — is neither income nor expense, so every aggregate here drops it: the
 * same rule the API applies to `GET /transactions/summary`
 * (`transactions.isInternalFlow`).
 */
export function excludeTransfers(txs: transactions.Transaction[]): transactions.Transaction[] {
  return txs.filter((t) => !transactionsContract.isInternalFlow(t));
}

/** Income/expense totals (primary currency) for the given transactions. */
export function monthFlow(txs: transactions.Transaction[]): MonthFlow {
  const primary = excludeTransfers(txs).filter((t) => t.currency === PRIMARY_CURRENCY);
  const income = sumMoney(primary.filter((t) => t.type === "INCOME").map((t) => t.amount));
  const expense = sumMoney(primary.filter((t) => t.type === "EXPENSE").map((t) => t.amount));
  const inc = Number(income);
  const exp = Number(expense);
  const savingsRate = inc > 0 ? Math.max(0, (inc - exp) / inc) : 0;
  return { income, expense, savingsRate };
}

export interface CategorySlice {
  /** Catalogue category id, `null` for uncategorised. */
  categoryId: string | null;
  total: string;
}

/** Expenses (primary currency) grouped by category, largest first. */
export function expensesByCategory(txs: transactions.Transaction[]): CategorySlice[] {
  const map = new Map<string | null, string[]>();
  for (const t of excludeTransfers(txs)) {
    if (t.type !== "EXPENSE" || t.currency !== PRIMARY_CURRENCY) continue;
    const key = t.categoryId ?? null;
    const bucket = map.get(key) ?? [];
    bucket.push(t.amount);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .map(([categoryId, vals]) => ({ categoryId, total: sumMoney(vals) }))
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
  /** Money coming IN: a debt someone owes you. Everything else is an outflow. */
  inflow: boolean;
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
        inflow: false,
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
      // What is still pending, not the original principal: a debt paid in part only owes the rest.
      amount: leftAmount(debt),
      currency: debt.currency,
      kind: "debt",
      inflow: debt.direction === "OWED_TO_YOU",
    });
  }

  for (const rec of recurrings) {
    // Paused and finished series have nothing coming up.
    if (rec.status !== "ACTIVE" || rec.nextDueAt === null) continue;
    if (new Date(rec.nextDueAt).getTime() < todayMs) continue;
    out.push({
      id: rec.id,
      label: rec.label,
      date: rec.nextDueAt,
      amount: rec.amount,
      currency: rec.currency,
      kind: "recurring",
      inflow: false,
    });
  }

  return out
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, limit);
}

/** One thing on the Panel that needs a decision soon: a billing period to pay, or a payment due
 * in the next few days. */
export interface AttentionItem {
  id: string;
  kind: "statement" | UpcomingKind;
  label: string;
  date: string;
  amount: string;
  currency: string;
  /** Its date has already passed. */
  overdue: boolean;
  /** Where acting on it happens. */
  href: string;
}

/** A credit card account's billing period, with the account it belongs to. */
export interface DueStatement {
  accountId: string;
  accountName: string;
  statement: accounts.CreditStatement;
}

const DAY_MS = 86_400_000;
const PAYMENT_HREF: Record<UpcomingKind, string> = {
  installment: "/installments",
  debt: "/debts",
  recurring: "/recurring",
};

/**
 * What the Panel puts first, before any figure:
 *  - every closed, unsettled billing period that still owes something and is due within
 *    `statementDays` (or already past due);
 *  - every outgoing payment (instalment, debt you owe, recurring) due within `paymentDays`.
 * Overdue first, then by date; at most `limit`. Money coming in (a debt owed to you) never
 * needs a decision, so it is left out. "Settled" is `paidAt`/`transferredAt`, never the status
 * name (a short payment settles as PARTIALLY_PAID).
 */
export function attentionItems(
  statements: DueStatement[],
  upcoming: UpcomingPayment[],
  now: Date,
  { statementDays = 7, paymentDays = 3, limit = 3 } = {},
): AttentionItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: AttentionItem[] = [];

  for (const { accountId, accountName, statement: s } of statements) {
    if (s.closedAt === null || s.dueDate === null) continue;
    if (s.paidAt !== null || s.transferredAt !== null) continue;
    if (!(Number(s.remainingAmount) > 0)) continue;
    const due = new Date(s.dueDate).getTime();
    if (due > today + statementDays * DAY_MS) continue;
    out.push({
      id: s.id,
      kind: "statement",
      label: accountName,
      date: s.dueDate,
      amount: s.remainingAmount,
      currency: s.currency,
      overdue: due < today,
      href: `/accounts/${accountId}?tab=billing&statement=${s.id}`,
    });
  }

  for (const p of upcoming) {
    if (p.inflow) continue;
    const due = new Date(p.date).getTime();
    if (due > today + paymentDays * DAY_MS) continue;
    out.push({
      id: p.id,
      kind: p.kind,
      label: p.label,
      date: p.date,
      amount: p.amount,
      currency: p.currency,
      overdue: due < today,
      href: PAYMENT_HREF[p.kind],
    });
  }

  return out
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    .slice(0, limit);
}
