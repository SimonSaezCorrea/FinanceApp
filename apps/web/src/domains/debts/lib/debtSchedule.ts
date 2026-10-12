import type { debts } from "@finance/contracts";
import { equalPrincipalSchedule, toMoney } from "@finance/money";

/** `partial`: the next instalment, with part of it already paid. `lost`: not
 * covered on a debt closed unpaid — it will never be. */
export type DebtInstallmentStatus = "paid" | "partial" | "next" | "pending" | "lost";

export interface DebtInstallment {
  /** 1-based. */
  sequence: number;
  /** Null when the debt has neither `dueAt` nor `openedAt` to anchor from. */
  dueDate: Date | null;
  amount: string;
  status: DebtInstallmentStatus;
  /** What already arrived toward a "next" instalment paid in part; "0.0000" otherwise. */
  paidPart: string;
}

/**
 * The debt's calendar of instalments, derived on the client.
 *
 * The backend keeps only a `paidInstallments`/`totalInstallments` counter — there is
 * no per-instalment table the way `InstallmentPlan`/`InstallmentPayment` have one — so
 * this mirrors `installments/lib/schedulePreview.ts`'s date-stepping to reconstruct a
 * calendar that is never actually stored.
 *
 * `dueAt` is read as the FIRST instalment's due date (matching the create form's
 * "Primer vencimiento" field, not a final/next date) — every subsequent instalment
 * steps forward by `frequency` × `frequencyInterval`. Falls back to `openedAt` when
 * there is no `dueAt` at all (an existing debt from before this field was required),
 * and to `null` dates when neither exists — the caller shows "Sin plazo definido"
 * for those rather than a fabricated date.
 */
export function debtSchedule(debt: debts.Debt): DebtInstallment[] {
  const count = Math.max(1, debt.totalInstallments);
  const amounts = debtInstallmentAmounts(debt);
  const start = debt.dueAt ? new Date(debt.dueAt) : debt.openedAt ? new Date(debt.openedAt) : null;

  // Payments may be for any amount: an instalment is paid once what arrived
  // covers it, and the first one not covered is "next" — with whatever part of
  // it already arrived in `paidPart`.
  const paid = toMoney(debt.paidAmount);
  let before = toMoney(0);
  let nextFound = false;

  return Array.from({ length: count }, (_, index) => {
    const dueDate = start ? addPeriod(start, index, debt.frequency, debt.frequencyInterval) : null;
    const after = before.plus(amounts[index]!);
    const covered = debt.settledAt !== null || after.lte(paid);
    let status: DebtInstallmentStatus = "paid";
    let paidPart = "0.0000";
    if (!covered) {
      if (!nextFound && paid.gt(before)) paidPart = paid.minus(before).toFixed(4);
      if (debt.writtenOffAt !== null) status = "lost";
      else if (nextFound) status = "pending";
      else status = paidPart !== "0.0000" ? "partial" : "next";
      nextFound = true;
    }
    before = after;

    return {
      sequence: index + 1,
      dueDate,
      amount: amounts[index]!,
      status,
      paidPart,
    };
  });
}

/** True when one instalment has part of it paid — "2/3" alone would hide it. */
export function hasPartialInstallment(debt: debts.Debt): boolean {
  return debtSchedule(debt).some((r) => r.paidPart !== "0.0000");
}

/**
 * Every instalment's amount, exactly as the server's `Debt.nextInstallmentAmount()`
 * charges them: an explicit `installmentAmount` is taken literally for each one;
 * otherwise `principal` is split with `equalPrincipalSchedule` in the debt's currency
 * — whole pesos for CLP, the last instalment absorbing the remainder.
 */
export function debtInstallmentAmounts(debt: debts.Debt): string[] {
  const count = Math.max(1, debt.totalInstallments);
  if (debt.installmentAmount !== null) {
    return Array.from({ length: count }, () => toMoney(debt.installmentAmount!).toFixed(4));
  }
  if (toMoney(debt.principal).lte(0)) return Array.from({ length: count }, () => "0.0000");
  return equalPrincipalSchedule({
    totalPrincipal: debt.principal,
    installmentCount: count,
    currency: debt.currency,
  }).map((r) => r.payment);
}

function addPeriod(
  date: Date,
  n: number,
  frequency: debts.Debt["frequency"],
  interval: number,
): Date {
  const d = new Date(date);
  const step = n * interval;
  switch (frequency) {
    case "DAILY":
      d.setDate(d.getDate() + step);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + step * 7);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      d.setMonth(d.getMonth() + step);
  }
  return d;
}
