import { z } from "zod";

import { moneyString } from "../common/money";

/** Savings domain contracts (SavingsGoal + SavingsEntry). Money as decimal strings. */

export const savingsGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  targetAmount: moneyString,
  currency: z.string(),
  deadline: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const createSavingsGoalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  targetAmount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  deadline: z.string().datetime().optional(),
});
export type CreateSavingsGoal = z.infer<typeof createSavingsGoalSchema>;

// zod v4's `.partial()` keeps a `.default(...)` active even when the key is
// absent, unlike v3 — left alone, an omitted `currency` on a PATCH would silently
// reset it to "USD" (the aggregate's `patch.currency !== undefined` check can't
// tell that apart from a real value). Re-declared without the default here.
export const updateSavingsGoalSchema = createSavingsGoalSchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
});
export type UpdateSavingsGoal = z.infer<typeof updateSavingsGoalSchema>;

export const savingsEntrySchema = z.object({
  id: z.string(),
  savingsGoalId: z.string().nullable(),
  amount: moneyString,
  currency: z.string(),
  contributedAt: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type SavingsEntry = z.infer<typeof savingsEntrySchema>;

export const createSavingsEntrySchema = z.object({
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  contributedAt: z.string().datetime(),
  savingsGoalId: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateSavingsEntry = z.infer<typeof createSavingsEntrySchema>;
