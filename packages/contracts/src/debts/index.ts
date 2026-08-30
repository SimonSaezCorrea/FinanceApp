import { z } from "zod";

import { moneyString } from "../common/money";
import { installmentFrequency } from "../installments";

/** Debts domain contracts (Debt). Money as decimal strings. */

export const debtDirection = z.enum(["OWED_TO_YOU", "YOU_OWE"]);
export type DebtDirection = z.infer<typeof debtDirection>;

export const debtSchema = z.object({
  id: z.string(),
  direction: debtDirection,
  counterparty: z.string(),
  principal: moneyString,
  currency: z.string(),
  openedAt: z.string(),
  dueAt: z.string().nullable(),
  interestApr: moneyString.nullable(),
  notes: z.string().nullable(),
  settledAt: z.string().nullable(),
  totalInstallments: z.number().int().min(1),
  paidInstallments: z.number().int().min(0),
  installmentAmount: moneyString.nullable(),
  frequency: installmentFrequency,
  frequencyInterval: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Debt = z.infer<typeof debtSchema>;

export const createDebtSchema = z.object({
  direction: debtDirection,
  counterparty: z.string().trim().min(1).max(160),
  principal: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  openedAt: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
  interestApr: moneyString.optional(),
  notes: z.string().trim().max(500).optional(),
  totalInstallments: z.number().int().min(1).default(1),
  installmentAmount: moneyString.optional(),
  frequency: installmentFrequency.default("MONTHLY"),
  frequencyInterval: z.number().int().min(1).max(999).default(1),
});
export type CreateDebt = z.infer<typeof createDebtSchema>;

// zod v4's `.partial()` keeps a `.default(...)` active even when the key is
// absent, unlike v3 — left alone, an omitted field on a PATCH would silently
// reset currency/totalInstallments/frequency/frequencyInterval to their
// create-time defaults. Re-declared without defaults here.
export const updateDebtSchema = createDebtSchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
  totalInstallments: z.number().int().min(1).optional(),
  frequency: installmentFrequency.optional(),
  frequencyInterval: z.number().int().min(1).max(999).optional(),
});
export type UpdateDebt = z.infer<typeof updateDebtSchema>;
