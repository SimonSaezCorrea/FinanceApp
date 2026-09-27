import { z } from "zod";

import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";

/** Recurring expenses (subscriptions, rent, periodic payments). Money as decimal strings. */

export const recurrenceFrequency = z.enum(["WEEKLY", "MONTHLY", "YEARLY"]);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequency>;

/** Derived, never stored: FINISHED once `endDate` has passed, PAUSED while
 * `active` is false, ACTIVE otherwise. Only ACTIVE series count toward totals
 * and have a next due date. */
export const recurringStatus = z.enum(["ACTIVE", "PAUSED", "FINISHED"]);
export type RecurringStatus = z.infer<typeof recurringStatus>;

export const recurringExpenseSchema = z.object({
  id: rowId,
  label: z.string(),
  amount: moneyString,
  currency: z.string(),
  /** FK into the global category catalogue (`reference.Category`). */
  categoryId: rowId.nullable(),
  frequency: recurrenceFrequency,
  interval: z.number().int().positive(),
  anchorDate: z.string(),
  bankAccountId: rowId.nullable(),
  /** The card this series is paid with, when it isn't a plain transfer out of
   * `bankAccountId` — purely informational, same spirit as `Debt.paymentAccountId`. */
  cardId: rowId.nullable(),
  active: z.boolean(),
  /** Last occurrence (inclusive) of a series that ended; null = open-ended. */
  endDate: z.string().nullable(),
  status: recurringStatus,
  notes: z.string().nullable(),
  /** Next occurrence on/after today, computed from anchorDate + frequency × interval.
   * Null once the series is FINISHED — there is no next one. */
  nextDueAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecurringExpense = z.infer<typeof recurringExpenseSchema>;

export const createRecurringExpenseSchema = z.object({
  label: z.string().trim().min(1).max(160),
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  categoryId: rowId.optional(),
  frequency: recurrenceFrequency,
  interval: z.number().int().min(1).max(366).default(1),
  anchorDate: z.string().datetime(),
  bankAccountId: rowId.optional(),
  cardId: rowId.optional(),
  active: z.boolean().optional(),
  /** Last occurrence (inclusive); must not be before `anchorDate`
   * (`RECURRING_END_BEFORE_START`). */
  endDate: z.string().datetime().optional(),
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
  /** `null` clears the category; omitted leaves it as it is. */
  categoryId: rowId.nullable().optional(),
  /** `null` reopens an ended series; omitted leaves it as it is. */
  endDate: z.string().datetime().nullable().optional(),
});
export type UpdateRecurringExpense = z.infer<typeof updateRecurringExpenseSchema>;
