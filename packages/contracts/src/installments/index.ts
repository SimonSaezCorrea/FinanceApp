import { addMoney, moneyToString, toMoney } from "@finance/money";
import { z } from "zod";

import type { CardKind } from "../accounts";
import { moneyString } from "../common/money";

/** Installments domain contracts (plan + scheduled payments). */

export const installmentFrequency = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
export type InstallmentFrequency = z.infer<typeof installmentFrequency>;

/**
 * A plan's state, derived from its oldest unpaid installment — never stored.
 *
 * `PARTIALLY_PAID` is the case of FR-023: a shortfall on the LAST installment has no
 * successor to carry into, so that installment stays payable and the plan stays
 * ACTIVE. Any code asking "is this plan finished?" must therefore test for `PAID`
 * alone, not for "no unpaid installments".
 */
export const installmentPlanStatus = z.enum([
  "OVERDUE",
  "DUE_SOON",
  "ON_TRACK",
  "PARTIALLY_PAID",
  "PAID",
]);
export type InstallmentPlanStatus = z.infer<typeof installmentPlanStatus>;

/** How far ahead an unpaid installment counts as "coming up" rather than "on track". */
export const DUE_SOON_DAYS = 7;

export const installmentPaymentSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  dueDate: z.string(),
  /** The SCHEDULED amount — never rewritten once the plan exists. */
  amount: moneyString,
  /** The REAL date of payment. "Paid" is `paidAt !== null`, never `paidAmount !== null`. */
  paidAt: z.string().nullable(),
  /** What was actually paid; null on an installment paid before this existed. */
  paidAmount: moneyString.nullable(),
  /** Inherited from the previous installment; negative when that one was overpaid. */
  carriedOverAmount: moneyString,
  /** Derived: `amount + carriedOverAmount`, floored at zero. */
  dueAmount: moneyString,
  /** The real expense backing this installment, when there is one. */
  transactionId: z.string().nullable(),
});
export type InstallmentPayment = z.infer<typeof installmentPaymentSchema>;

/**
 * What deleting a plan would undo (FR-050b) — movements erased and balances given
 * back, per account. Declared BEFORE the confirmation, because this is an
 * irreversible operation over money already recorded and presenting it as an
 * ordinary delete would hide that.
 */
export const installmentDeletionImpactSchema = z.object({
  /** How many real movements disappear: the instalment expenses + the finance charge. */
  movementCount: z.number().int().nonnegative(),
  balanceRestorations: z.array(
    z.object({ accountId: z.string(), amount: moneyString, currency: z.string() }),
  ),
});
export type InstallmentDeletionImpact = z.infer<typeof installmentDeletionImpactSchema>;

export const installmentPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  totalPrincipal: moneyString,
  installmentCount: z.number().int().positive(),
  startDate: z.string(),
  currency: z.string(),
  frequency: installmentFrequency,
  frequencyInterval: z.number().int().positive(),
  /** The card this purchase was put on, when there was one — a plan can equally
   * be a bank loan with no card behind it. */
  cardId: z.string().nullable(),
  /** Free text, same repertoire as a movement's category; the row's icon comes from it. */
  category: z.string().nullable(),
  /** The account remembered to pre-fill each payment form. Null on a CREDIT-card plan. */
  paymentAccountId: z.string().nullable(),
  notes: z.string().nullable(),
  payments: z.array(installmentPaymentSchema),

  // --- Derived by the API, never stored ---
  /** Σ of what was actually paid (falling back to the scheduled amount on legacy rows). */
  paidTotal: moneyString,
  /** What the plan still owes, carry-overs included. */
  remainingAmount: moneyString,
  /** Due date of the oldest unpaid installment, or null when none is left. */
  nextDueDate: z.string().nullable(),
  status: installmentPlanStatus,
  /** False ⇔ the plan's card is CREDIT: paying an installment records no movement. */
  generatesMovementOnPay: z.boolean(),
  /**
   * Only the DETAIL response carries it; the list answers `null`. Computing it means
   * reading every movement of every plan, and the only caller is the delete
   * confirmation — which already has one plan open.
   */
  deletionImpact: installmentDeletionImpactSchema.nullable(),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;

export const createInstallmentPlanSchema = z.object({
  title: z.string().trim().min(1).max(160),
  totalPrincipal: moneyString,
  installmentCount: z.number().int().positive().max(600),
  startDate: z.string().datetime(),
  currency: z.string().trim().length(3).default("USD"),
  frequency: installmentFrequency.default("MONTHLY"),
  frequencyInterval: z.number().int().min(1).max(999).default(1),
  aprPerPeriod: moneyString.optional(),
  cardId: z.string().nullish(),
  category: z.string().trim().max(120).nullish(),
  paymentAccountId: z.string().nullish(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateInstallmentPlan = z.infer<typeof createInstallmentPlanSchema>;

export const updateInstallmentPlanSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  currency: z.string().trim().length(3).optional(),
  frequency: installmentFrequency.optional(),
  frequencyInterval: z.number().int().min(1).max(999).optional(),
  cardId: z.string().nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  paymentAccountId: z.string().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateInstallmentPlan = z.infer<typeof updateInstallmentPlanSchema>;

/**
 * Body of `POST /installments/:id/payments/:sequence/pay`.
 *
 * Two amounts, not one, and deliberately so: with no exchange rate anywhere in this
 * app, "how much this settles of the debt" and "how much left the account" are two
 * different facts that only the user knows (FR-029/FR-031). When both currencies
 * match — the ordinary case — the second is derived from the first and the form shows
 * a single field.
 */
export const payInstallmentSchema = z.object({
  /** Omitted on a CREDIT-card plan: there the installment is only marked. */
  fromAccountId: z.string().nullish(),
  /** Credited to the installment, in the PLAN's currency. Omitted = everything owed. */
  amount: moneyString.nullish(),
  /** Charged to the account, in the ACCOUNT's currency. Required only when they differ. */
  chargedAmount: moneyString.nullish(),
  /** Real date of payment. Omitted = today. */
  paidAt: z.string().datetime().nullish(),
});
export type PayInstallment = z.infer<typeof payInstallmentSchema>;

// --- Shared predicates: the UI and the API must answer these identically ---

/**
 * What an installment owes: its scheduled amount plus whatever the previous one
 * carried into it. Floored at zero — a surplus large enough to swallow the whole
 * installment settles it, it never turns into money the plan owes back (FR-021a).
 */
export function dueAmountOf(payment: { amount: string; carriedOverAmount: string }): string {
  const owed = toMoney(addMoney(payment.amount, payment.carriedOverAmount));
  return moneyToString(owed.greaterThan(0) ? owed : 0);
}

/**
 * A plan bought with a CREDIT card records NO movement when an installment is paid:
 * that purchase already sits in the card account's statement, and recording it again
 * would count the same debt twice. Any other card — or no card — pays with real money
 * on each installment, so the movement is correct there.
 */
export function generatesMovementOnPay(cardKind: CardKind | null): boolean {
  return cardKind !== "CREDIT";
}

/**
 * The plan's state (FR-003).
 *
 * `hasUnsettledShortfall` is the case of FR-023: the ONLY installment still owing is
 * one that was paid in part and had no successor to carry the shortfall into. It
 * outranks the date-derived states because "you already paid this one, just not all
 * of it" is a different situation from "this one is overdue", and conflating them
 * would tell the user they never paid.
 *
 * Why a settled-but-short installment cannot exist elsewhere: a short payment WITH a
 * successor settles the installment and moves the shortfall onto that successor, so
 * the debt is only ever in one place at a time. Only the last one has nowhere to move
 * it, and therefore stays unpaid, holding its partial credit.
 */
export function planStatus(
  nextDueDate: string | null,
  now: Date,
  hasUnsettledShortfall: boolean,
): InstallmentPlanStatus {
  if (nextDueDate === null) return "PAID";
  if (hasUnsettledShortfall) return "PARTIALLY_PAID";
  const due = new Date(nextDueDate).getTime();
  const today = now.getTime();
  if (due < today) return "OVERDUE";
  return due <= today + DUE_SOON_DAYS * 86_400_000 ? "DUE_SOON" : "ON_TRACK";
}

/** A plan is active while anything is still owed on it. */
export function isActivePlan(status: InstallmentPlanStatus): boolean {
  return status !== "PAID";
}
