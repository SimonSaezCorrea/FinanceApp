import Decimal from "decimal.js";

import type { recurring } from "@finance/contracts";
import { moneyToString, sumMoney } from "@finance/money";

/**
 * Normalization to a monthly figure, exactly as the design handoff specifies.
 * `DAILY` is kept even though `RecurrenceFrequency` (the real contract) has no
 * such value — a `PER_MONTH[r.frequency]` lookup stays total either way, and
 * nothing in this domain can ever produce a DAILY row today.
 */
export const PER_MONTH: Record<recurring.RecurrenceFrequency | "DAILY", number> = {
  DAILY: 30.417,
  WEEKLY: 4.333,
  MONTHLY: 1,
  YEARLY: 1 / 12,
};

/** Fixed order the design groups periodicities in — `DAILY` never renders
 * (the contract has no such frequency), kept only so a future addition slots
 * in without reordering this list. */
export const FREQUENCY_ORDER: recurring.RecurrenceFrequency[] = ["WEEKLY", "MONTHLY", "YEARLY"];

/** `r.amount × PER_MONTH[r.frequency]`, at the money package's own scale. */
export function monthlyAmount(r: recurring.RecurringExpense): string {
  return moneyToString(new Decimal(r.amount).times(PER_MONTH[r.frequency]));
}

/** Active (non-paused) items only — paused series never count toward a total,
 * a breakdown, or a periodicity group's own sum. */
export function activeOnly(list: recurring.RecurringExpense[]): recurring.RecurringExpense[] {
  return list.filter((r) => r.active);
}

export interface CategoryShare {
  category: string;
  amount: string;
  sharePct: number;
}

/** Ordered by monthly amount descending, up to the top 4 categories — same
 * cap the handoff's total card uses. Grouped by currency by the caller
 * (`recurringByCurrency`), since summing CLP and USD together would produce a
 * number this app's lack of FX conversion can't back up. */
export function categoryBreakdown(list: recurring.RecurringExpense[]): CategoryShare[] {
  const map = new Map<string, Decimal>();
  for (const r of list) {
    const key = r.category ?? "";
    map.set(key, (map.get(key) ?? new Decimal(0)).plus(new Decimal(monthlyAmount(r))));
  }
  const total = Array.from(map.values()).reduce((acc, v) => acc.plus(v), new Decimal(0));
  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category,
      amount: amount.toFixed(4),
      sharePct: total.isZero() ? 0 : Math.round(amount.dividedBy(total).times(100).toNumber()),
    }))
    .sort((a, b) => new Decimal(b.amount).comparedTo(new Decimal(a.amount)))
    .slice(0, 4);
}

export interface RecurringCurrencyGroup {
  currency: string;
  items: recurring.RecurringExpense[];
  monthlyTotal: string;
  breakdown: CategoryShare[];
}

/**
 * Splits the active list by currency — the handoff's total card assumes one
 * currency; this app has no FX conversion, so each currency gets its own
 * card/breakdown instead of one meaningless combined figure (same convention
 * `DebtKpiStrip`/`summarizeDebts` already use).
 */
export function recurringByCurrency(list: recurring.RecurringExpense[]): RecurringCurrencyGroup[] {
  const active = activeOnly(list);
  const currencies = Array.from(new Set(active.map((r) => r.currency)));
  return currencies.map((currency) => {
    const items = active.filter((r) => r.currency === currency);
    return {
      currency,
      items,
      monthlyTotal: sumMoney(items.map(monthlyAmount)),
      breakdown: categoryBreakdown(items),
    };
  });
}

export interface DueNote {
  /** `nextDueAt` already passed and the series is still active. */
  overdue: boolean;
  /** Whole days between today and `nextDueAt` (always ≥ 0). */
  days: number;
}

/** Whole-day distance to `nextDueAt`, direction-agnostic — same shape as
 * `debts`' own `dueInfo`, mirrored here since this domain has no shared date
 * helper of its own yet. */
export function dueNote(nextDueAt: string, now: Date = new Date()): DueNote {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDueAt);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  return { overdue: diffDays < 0, days: Math.abs(diffDays) };
}

export function isOverdue(r: recurring.RecurringExpense, now: Date = new Date()): boolean {
  return r.active && dueNote(r.nextDueAt, now).overdue;
}

/** "3 sep" — day + short month, no year (the design's row meta format). */
export function formatShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** "3 sep 2026" — day + short month + year (detail panel / form dates). */
export function formatLongDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}
