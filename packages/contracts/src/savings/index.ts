import { z } from "zod";

import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";

/** Savings domain contracts (SavingsGoal + SavingsEntry). Money as decimal strings. */

export const savingsGoalCloseDestination = z.enum([
  "WITHDRAW_TO_ACCOUNT",
  "FREE_SAVINGS",
  "TRANSFER_TO_GOAL",
]);
export type SavingsGoalCloseDestination = z.infer<typeof savingsGoalCloseDestination>;

/** Fixed palette a goal's accent may be user-picked from — the same design
 * tokens the rest of the app already themes with, never a one-off hex. */
export const savingsGoalColor = z.enum([
  "brand",
  "success",
  "accent",
  "warning",
  "destructive",
  "primary",
  "info",
  "muted-foreground",
]);
export type SavingsGoalColor = z.infer<typeof savingsGoalColor>;

export const savingsGoalSchema = z.object({
  id: rowId,
  title: z.string(),
  targetAmount: moneyString,
  currency: z.string(),
  deadline: z.string().nullable(),
  notes: z.string().nullable(),
  /** `null` = automatic (a deterministic hash of the goal's own id decides
   * it, `goalVisual.ts`) — a user-picked accent otherwise. */
  color: savingsGoalColor.nullable(),
  /** `null` = the goal is open. */
  closedAt: z.string().nullable(),
  closeDestination: savingsGoalCloseDestination.nullable(),
  /** Only set when `closeDestination === "WITHDRAW_TO_ACCOUNT"` — display-only
   * ("retirado a «{cuenta}»"), same spirit as `Debt.lastPaymentAccountId`;
   * degrades gracefully if that account is deleted. */
  closeAccountId: rowId.nullable(),
  /** Only set when `closeDestination === "TRANSFER_TO_GOAL"` — display-only
   * ("traspasado a «{meta}»"); degrades gracefully if that goal is deleted. */
  closeTargetGoalId: rowId.nullable(),
  /** Derived, never written by the client: Σ every real aporte ever linked to
   * this goal (open or closed — the history is never lost). */
  savedAmount: moneyString,
  /** Derived, never written by the client: average of the last 3 complete
   * calendar months of real aportes (or since the goal's own creation if
   * younger, divided by the elapsed months, minimum 1). `"0"` with none. */
  pace: moneyString,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const createSavingsGoalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  targetAmount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  deadline: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
  color: savingsGoalColor.optional(),
});
export type CreateSavingsGoal = z.infer<typeof createSavingsGoalSchema>;

// zod v4's `.partial()` keeps a `.default(...)` active even when the key is
// absent, unlike v3 — left alone, an omitted `currency` on a PATCH would silently
// reset it to "USD" (the aggregate's `patch.currency !== undefined` check can't
// tell that apart from a real value). Re-declared without the default here.
// `currency` is accepted in the body but rejected by the handler
// (SAVINGS_GOAL_CURRENCY_LOCKED) once the goal has any aporte — that
// validation depends on a count, not the shape of the body, so it lives in
// the domain, not here. `deadline` is re-declared nullable — explicit `null`
// is how the UI's "con fecha límite" switch clears an existing one, distinct
// from omitting the field entirely ("no change").
// `color` is re-declared nullable — explicit `null` is how "Automático" resets
// a previously-chosen accent back to the deterministic hash, distinct from
// omitting the field entirely ("no change").
export const updateSavingsGoalSchema = createSavingsGoalSchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
  deadline: z.string().datetime().nullable().optional(),
  color: savingsGoalColor.nullable().optional(),
});
export type UpdateSavingsGoal = z.infer<typeof updateSavingsGoalSchema>;

/** Body for `POST /savings/goals/:id/close`. Only `WITHDRAW_TO_ACCOUNT` moves
 * real money; the other two destinations only reassign `SavingsEntry.savingsGoalId`. */
export const closeSavingsGoalSchema = z.discriminatedUnion("destination", [
  z.object({
    destination: z.literal("WITHDRAW_TO_ACCOUNT"),
    accountId: rowId,
    closedAt: z.string().datetime().optional(),
  }),
  z.object({
    destination: z.literal("FREE_SAVINGS"),
    closedAt: z.string().datetime().optional(),
  }),
  z.object({
    destination: z.literal("TRANSFER_TO_GOAL"),
    targetGoalId: rowId,
    closedAt: z.string().datetime().optional(),
  }),
]);
export type CloseSavingsGoal = z.infer<typeof closeSavingsGoalSchema>;

export const savingsEntrySchema = z.object({
  id: rowId,
  savingsGoalId: rowId.nullable(),
  amount: moneyString,
  currency: z.string(),
  contributedAt: z.string(),
  /** Short label — what every list (ahorro libre, historial de la meta)
   * displays as the aporte's name. Same title/notes split `Debt` already has. */
  title: z.string().nullable(),
  note: z.string().nullable(),
  /** The real source account this contribution came from. Nullable so the
   * entry survives that account's own deletion — it just loses the reference. */
  bankAccountId: rowId.nullable(),
  createdAt: z.string(),
});
export type SavingsEntry = z.infer<typeof savingsEntrySchema>;

export const createSavingsEntrySchema = z.object({
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  contributedAt: z.string().datetime(),
  savingsGoalId: rowId.optional(),
  /** Required: a contribution is real money now, it always has a source
   * account (never optional the way `savingsGoalId` is). */
  bankAccountId: rowId,
  /** Optional in the schema — the handler requires it when `savingsGoalId`
   * is absent (an ahorro-libre aporte has nothing else to identify it by;
   * one that belongs to a goal already has the goal's own name). Same
   * title/notes split `debts` already has. */
  title: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateSavingsEntry = z.infer<typeof createSavingsEntrySchema>;

/**
 * A contribution recorded by mistake used to be permanent — the entry had no
 * update or delete path at all. `currency` is re-declared optional so the
 * create schema's `.default("USD")` cannot resurrect on a PATCH that never
 * mentioned it (same correction as commit e93dc0b).
 */
export const updateSavingsEntrySchema = createSavingsEntrySchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
});
export type UpdateSavingsEntry = z.infer<typeof updateSavingsEntrySchema>;

/** `GET /savings/summary` — aggregated across every OPEN/CUMPLIDA goal plus
 * ahorro libre; a closed goal contributes to none of these. */
export const savingsSummarySchema = z.object({
  totalSaved: moneyString,
  freeSavingsTotal: moneyString,
  /** Sum of `pace` over goals that are neither cumplida nor cerrada. */
  pace: moneyString,
  missing: moneyString,
});
export type SavingsSummary = z.infer<typeof savingsSummarySchema>;
