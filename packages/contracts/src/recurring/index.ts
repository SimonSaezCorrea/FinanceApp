import { z } from "zod";

import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";

/** Recurring expenses (subscriptions, rent, periodic payments). Money as decimal strings. */

export const recurrenceFrequency = z.enum(["WEEKLY", "MONTHLY", "YEARLY"]);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequency>;

export const recurringExpenseSchema = z.object({
  id: rowId,
  label: z.string(),
  amount: moneyString,
  currency: z.string(),
  category: z.string().nullable(),
  frequency: recurrenceFrequency,
  interval: z.number().int().positive(),
  anchorDate: z.string(),
  bankAccountId: rowId.nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  /** Next occurrence on/after today, computed from anchorDate + frequency × interval. */
  nextDueAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecurringExpense = z.infer<typeof recurringExpenseSchema>;

export const createRecurringExpenseSchema = z.object({
  label: z.string().trim().min(1).max(160),
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  category: z.string().trim().max(120).optional(),
  frequency: recurrenceFrequency,
  interval: z.number().int().min(1).max(366).default(1),
  anchorDate: z.string().datetime(),
  bankAccountId: rowId.optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CreateRecurringExpense = z.infer<typeof createRecurringExpenseSchema>;

// zod v4's `.partial()` keeps a `.default(...)` active even when the key is
// absent, unlike v3 — left alone, an omitted field on a PATCH would silently
// reset currency/interval to their create-time defaults. Re-declared without
// defaults here.
export const updateRecurringExpenseSchema = createRecurringExpenseSchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
  interval: z.number().int().min(1).max(366).optional(),
});
export type UpdateRecurringExpense = z.infer<typeof updateRecurringExpenseSchema>;
