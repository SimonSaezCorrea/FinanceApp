import { installments } from "@finance/contracts";
import { sumMoney, toMoney } from "@finance/money";

/**
 * The figures the Cuotas view derives on the client.
 *
 * Unlike Movements, this list is NOT paginated: `GET /installments` returns every
 * plan with its instalments, so deriving here is exact rather than a guess over
 * loaded pages. That is the whole reason there is no `/installments/summary`
 * endpoint — see research.md §R8. The day the list gets paginated, these move to the
 * server, because then they would start lying.
 */

export type PlanFilter = "all" | "unpaid" | "paid";

/** How far out the "next 3 months" filter reaches. */
const WINDOW_MONTHS = 3;

export interface PlanKpis {
  currency: string;
  /** What the current calendar month commits — paid instalments included. */
  thisMonth: string;
  /** Everything still owed, carry-overs included. */
  pendingTotal: string;
  /** Earliest instalment still owing across all plans of this currency. */
  nextDueDate: string | null;
  nextIsOverdue: boolean;
  /** Plans with anything left to pay. */
  activeCount: number;
}

/**
 * The four header figures, one group per currency.
 *
 * "This month" counts instalments falling in the current calendar month whether or
 * not they are already paid: it answers "what does this month cost me", which is a
 * different question from "what do I still owe" — that one is `pendingTotal`. It
 * deliberately ignores the user's billing cycle, which belongs to an account and has
 * nothing to say about a plan (FR-004a).
 */
export function planKpis(
  plans: installments.InstallmentPlan[],
  now: Date = new Date(),
): PlanKpis[] {
  const byCurrency = new Map<string, installments.InstallmentPlan[]>();
  for (const plan of plans) {
    const group = byCurrency.get(plan.currency) ?? [];
    group.push(plan);
    byCurrency.set(plan.currency, group);
  }

  return [...byCurrency.entries()].map(([currency, group]) => {
    const dueDates = group
      .map((p) => p.nextDueDate)
      .filter((d): d is string => d !== null)
      .sort();
    const nextDueDate = dueDates[0] ?? null;

    return {
      currency,
      thisMonth: sumMoney(
        group.flatMap((p) =>
          p.payments.filter((i) => isSameMonth(i.dueDate, now)).map((i) => i.dueAmount),
        ),
      ),
      pendingTotal: sumMoney(group.map((p) => p.remainingAmount)),
      nextDueDate,
      nextIsOverdue: nextDueDate !== null && new Date(nextDueDate).getTime() < now.getTime(),
      activeCount: group.filter((p) => installments.isActivePlan(p.status)).length,
    };
  });
}

/**
 * The plans the list shows, filtered and ordered.
 *
 * The two filters INTERSECT (FR-008a): "unpaid + next 3 months" means both, not
 * either. Order is by next instalment ascending — the most urgent on top — with
 * finished plans last, since they have no next instalment to sort by (FR-001a).
 */
export function visiblePlans(
  plans: installments.InstallmentPlan[],
  filter: PlanFilter,
  withinWindow: boolean,
  now: Date = new Date(),
): installments.InstallmentPlan[] {
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + WINDOW_MONTHS);

  return plans
    .filter((p) => {
      const active = installments.isActivePlan(p.status);
      if (filter === "unpaid" && !active) return false;
      if (filter === "paid" && active) return false;
      // A finished plan has no next instalment, so it can never fall inside a window
      // defined by one — it drops out rather than being treated as "due never".
      if (withinWindow) {
        if (p.nextDueDate === null) return false;
        if (new Date(p.nextDueDate).getTime() > horizon.getTime()) return false;
      }
      return true;
    })
    .sort(byNextDue);
}

function byNextDue(a: installments.InstallmentPlan, b: installments.InstallmentPlan): number {
  if (a.nextDueDate === null && b.nextDueDate === null) return a.title.localeCompare(b.title);
  if (a.nextDueDate === null) return 1;
  if (b.nextDueDate === null) return -1;
  return a.nextDueDate.localeCompare(b.nextDueDate);
}

/** How many of the plan's instalments are settled, for the n/N progress figure. */
export function paidCount(plan: installments.InstallmentPlan): number {
  return plan.payments.filter((p) => p.paidAt !== null).length;
}

/** 0..1, for the progress bar. */
export function progressRatio(plan: installments.InstallmentPlan): number {
  if (plan.installmentCount === 0) return 0;
  return paidCount(plan) / plan.installmentCount;
}

/** The instalment a payment action would target: the oldest one still owing. */
export function nextDuePayment(
  payments: installments.InstallmentPayment[],
): installments.InstallmentPayment | null {
  let earliest: installments.InstallmentPayment | null = null;
  for (const p of payments) {
    if (!isOwing(p)) continue;
    if (earliest === null || p.sequence < earliest.sequence) earliest = p;
  }
  return earliest;
}

export type PaymentStatus = "paid" | "billed" | "partial" | "upcoming" | "pending";

export function paymentStatus(
  p: installments.InstallmentPayment,
  payments: installments.InstallmentPayment[],
): PaymentStatus {
  // "Paid" is `paidAt`, never `paidAmount`: a row paid before this feature existed
  // has a date and no amount, and it IS paid. Checked FIRST — a settled instalment
  // keeps its `creditStatementId` (FR-020 needs it to reach the settling period),
  // so testing that before `paidAt` would misreport a paid one as merely billed.
  if (p.paidAt !== null) return "paid";
  // Spec 014: charged into a period awaiting its payment. Only ever true on a
  // credit-card plan's instalment — every other plan settles straight to "paid".
  if (p.status === "BILLED") return "billed";
  // Unpaid but with money against it: the last instalment, paid short, with no
  // successor to carry the difference into (FR-023).
  if (p.paidAmount !== null) return "partial";
  return nextDuePayment(payments)?.id === p.id ? "upcoming" : "pending";
}

/** The i18n key for why a plan's instalments can't reach a statement, or null when
 * nothing blocks them (spec 014, FR-009a/FR-023a). */
export function billingWarningKey(plan: installments.InstallmentPlan): string | null {
  return plan.billingWarning ? `installments.warning.${plan.billingWarning}` : null;
}

/** What this instalment still owes — 0 once settled. */
export function outstandingOn(p: installments.InstallmentPayment): string {
  if (p.paidAt !== null) return "0.0000";
  const left = toMoney(p.dueAmount).minus(toMoney(p.paidAmount ?? "0"));
  return left.greaterThan(0) ? left.toFixed(4) : "0.0000";
}

function isOwing(p: installments.InstallmentPayment): boolean {
  return p.paidAt === null;
}

function isSameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}
