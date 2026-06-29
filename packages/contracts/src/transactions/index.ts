import { z } from "zod";

import { moneyString } from "../common/money";

/** Transactions domain contracts. Amounts are positive decimal strings; sign is the `type`. */

export const transactionType = z.enum(["INCOME", "EXPENSE"]);
export type TransactionType = z.infer<typeof transactionType>;

export const transactionSchema = z.object({
  id: z.string(),
  type: transactionType,
  amount: moneyString,
  currency: z.string(),
  occurredAt: z.string(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  observation: z.string().nullable(),
  emisor: z.string().nullable(),
  receptor: z.string().nullable(),
  lugar: z.string().nullable(),
  bankAccountId: z.string().nullable(),
  cardId: z.string().nullable(),
  installmentPlanId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const createTransactionSchema = z.object({
  type: transactionType,
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  occurredAt: z.string().datetime(),
  category: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  observation: z.string().trim().max(500).optional(),
  emisor: z.string().trim().max(200).optional(),
  receptor: z.string().trim().max(200).optional(),
  lugar: z.string().trim().max(200).optional(),
  bankAccountId: z.string().optional(),
  cardId: z.string().optional(),
});
export type CreateTransaction = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;

/** Optional list filters (query params). */
export const transactionFiltersSchema = z.object({
  type: transactionType.optional(),
  bankAccountId: z.string().optional(),
  cardId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
