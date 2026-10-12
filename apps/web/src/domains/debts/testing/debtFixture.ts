import Decimal from "decimal.js";

import type { debts } from "@finance/contracts";

import { debtInstallmentAmounts } from "../lib/debtSchedule";

/**
 * Test fixtures describe a debt by its counter (`paidInstallments`); the app
 * reads what was paid from `paidAmount`. Fills it in the way the API does for
 * a debt that had no amount recorded: the schedule's first N instalments (the
 * whole debt once settled). An explicit `paidAmount` is kept.
 */
export function withPaidAmount(debt: debts.Debt): debts.Debt {
  const writtenOffAt = debt.writtenOffAt ?? null;
  if (debt.paidAmount !== undefined) return { ...debt, writtenOffAt };
  const rows = debtInstallmentAmounts(debt);
  const n = debt.settledAt !== null ? rows.length : Math.min(debt.paidInstallments, rows.length);
  const paid = rows.slice(0, n).reduce((acc, a) => acc.plus(a), new Decimal(0));
  return { ...debt, paidAmount: paid.toFixed(4), writtenOffAt };
}
