import Decimal from "decimal.js";

import type { installments } from "@finance/contracts";

export function nextDuePayment(
  payments: installments.InstallmentPayment[],
): installments.InstallmentPayment | null {
  const unpaid = payments.filter((p) => p.paidAt === null);
  if (unpaid.length === 0) return null;
  return unpaid.reduce((min, p) => (p.sequence < min.sequence ? p : min), unpaid[0]!);
}

export function paymentStatus(
  p: installments.InstallmentPayment,
  payments: installments.InstallmentPayment[],
): "paid" | "upcoming" | "pending" {
  if (p.paidAt !== null) return "paid";
  const next = nextDuePayment(payments);
  return next?.id === p.id ? "upcoming" : "pending";
}

export function monthlyAmount(plan: installments.InstallmentPlan): string {
  return new Decimal(plan.totalPrincipal)
    .dividedBy(plan.installmentCount)
    .toFixed(4, Decimal.ROUND_HALF_EVEN);
}
