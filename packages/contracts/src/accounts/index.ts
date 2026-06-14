import { z } from "zod";

import { moneyString } from "../common/money";

/** Accounts domain contracts (BankAccount). Money as decimal strings. */

export const bankAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  institution: z.string().nullable(),
  currentBalance: moneyString,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BankAccount = z.infer<typeof bankAccountSchema>;

export const createBankAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().length(3).default("USD"),
  institution: z.string().trim().max(120).optional(),
  currentBalance: moneyString.optional(),
});
export type CreateBankAccount = z.infer<typeof createBankAccountSchema>;

export const updateBankAccountSchema = createBankAccountSchema.partial();
export type UpdateBankAccount = z.infer<typeof updateBankAccountSchema>;
