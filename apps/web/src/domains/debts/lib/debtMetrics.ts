import Decimal from "decimal.js";

import type { debts } from "@finance/contracts";

export interface DebtKpi {
  currency: string;
  totalOwedToYou: string;
  totalYouOwe: string;
  netBalance: string;
}

export function summarizeDebtsByCurrency(list: debts.Debt[]): DebtKpi[] {
  const active = list.filter((d) => d.settledAt === null);
  const map = new Map<string, { owedToYou: Decimal; youOwe: Decimal }>();

  for (const d of active) {
    const entry = map.get(d.currency) ?? {
      owedToYou: new Decimal(0),
      youOwe: new Decimal(0),
    };
    if (d.direction === "OWED_TO_YOU") {
      entry.owedToYou = entry.owedToYou.plus(new Decimal(d.principal));
    } else {
      entry.youOwe = entry.youOwe.plus(new Decimal(d.principal));
    }
    map.set(d.currency, entry);
  }

  return Array.from(map.entries()).map(([currency, { owedToYou, youOwe }]) => ({
    currency,
    totalOwedToYou: owedToYou.toFixed(4),
    totalYouOwe: youOwe.toFixed(4),
    netBalance: owedToYou.minus(youOwe).toFixed(4),
  }));
}

export function calcRemaining(debt: debts.Debt): string {
  const pending = new Decimal(debt.totalInstallments - debt.paidInstallments);
  const perInstallment =
    debt.installmentAmount !== null
      ? new Decimal(debt.installmentAmount)
      : new Decimal(debt.principal).dividedBy(debt.totalInstallments);
  return pending.times(perInstallment).toFixed(4);
}

/** What is genuinely still owed: zero once the debt is settled — `calcRemaining`
 * alone doesn't know about `settledAt`, and a debt marked paid in one shot
 * (single instalment) always has `paidInstallments < totalInstallments` be
 * false-but-irrelevant once settled. */
export function leftAmount(debt: debts.Debt): string {
  if (debt.settledAt !== null) return "0.0000";
  return calcRemaining(debt);
}

/** Overdue = still open, has a due date, and that date is in the past. */
export function isOverdue(debt: debts.Debt, now: Date = new Date()): boolean {
  return (
    debt.settledAt === null && debt.dueAt !== null && new Date(debt.dueAt).getTime() < now.getTime()
  );
}

export interface DebtSummary {
  currency: string;
  /** Sum of `leftAmount` across active YOU_OWE debts of this currency. */
  youOwe: string;
  /** Sum of `leftAmount` across active OWED_TO_YOU debts of this currency. */
  owedYou: string;
  /** owedYou − youOwe. */
  net: string;
  /** youOwe / (youOwe + owedYou) × 100, rounded — 0 when nothing circulates. */
  oweSharePct: number;
  /** Sum of `leftAmount` across active, overdue debts of this currency. */
  overdueSum: string;
}

/**
 * The summary card's figures, grouped by currency — the handoff's prototype
 * assumes a single currency; with no FX conversion in this app, adding CLP to
 * USD would produce a number that means nothing, so each currency gets its own
 * card (same convention `summarizeDebtsByCurrency`/`planKpis` already use).
 */
export function summarizeDebts(list: debts.Debt[], now: Date = new Date()): DebtSummary[] {
  const active = list.filter((d) => d.settledAt === null);
  const map = new Map<string, { youOwe: Decimal; owedYou: Decimal; overdue: Decimal }>();

  for (const d of active) {
    const entry = map.get(d.currency) ?? {
      youOwe: new Decimal(0),
      owedYou: new Decimal(0),
      overdue: new Decimal(0),
    };
    const left = new Decimal(leftAmount(d));
    if (d.direction === "YOU_OWE") entry.youOwe = entry.youOwe.plus(left);
    else entry.owedYou = entry.owedYou.plus(left);
    if (isOverdue(d, now)) entry.overdue = entry.overdue.plus(left);
    map.set(d.currency, entry);
  }

  return Array.from(map.entries()).map(([currency, { youOwe, owedYou, overdue }]) => {
    const total = youOwe.plus(owedYou);
    const oweSharePct = total.isZero()
      ? 0
      : Math.round(youOwe.dividedBy(total).times(100).toNumber());
    return {
      currency,
      youOwe: youOwe.toFixed(4),
      owedYou: owedYou.toFixed(4),
      net: owedYou.minus(youOwe).toFixed(4),
      oweSharePct,
      overdueSum: overdue.toFixed(4),
    };
  });
}

export function uniquePeopleCount(list: debts.Debt[]): number {
  return new Set(list.map((d) => d.counterparty)).size;
}

/** Up to two initials from a person's name, for the round avatar chip. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export interface DueInfo {
  /** True when the date is in the past. */
  overdue: boolean;
  /** Absolute number of whole days to/since the date; null with no date at all. */
  days: number | null;
}

/** How far a due date is from `now`, direction-agnostic — the caller decides
 * the wording ("en N días" / "hace N días" / "Sin plazo definido"). */
export function dueInfo(dueAt: string | null, now: Date = new Date()): DueInfo {
  if (dueAt === null) return { overdue: false, days: null };
  const diffMs = new Date(dueAt).getTime() - now.getTime();
  const days = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  return { overdue: diffMs < 0, days };
}

/** "12 sep 2026" — shared by the table, list, detail panel and pay panel so
 * they can't drift into slightly different date formats. */
export function formatDebtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
