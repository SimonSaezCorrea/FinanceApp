import type { debts } from "@finance/contracts";
import { equalPrincipalSchedule, toMoney } from "@finance/money";

export type DebtInstallmentStatus = "paid" | "next" | "pending";

export interface DebtInstallment {
  /** 1-based. */
  sequence: number;
  /** Null when the debt has neither `dueAt` nor `openedAt` to anchor from. */
  dueDate: Date | null;
  amount: string;
  status: DebtInstallmentStatus;
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

  return Array.from({ length: count }, (_, index) => {
    const dueDate = start ? addPeriod(start, index, debt.frequency, debt.frequencyInterval) : null;
    const status: DebtInstallmentStatus =
      debt.settledAt !== null || index < debt.paidInstallments
        ? "paid"
        : index === debt.paidInstallments
          ? "next"
          : "pending";

    return {
      sequence: index + 1,
      dueDate,
      amount: amounts[index]!,
      status,
    };
  });
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
