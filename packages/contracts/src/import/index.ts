import { z } from "zod";

import { moneyString } from "../common/money";

/** Bulk-import domain contracts. Rows are already-parsed transactions. */

export const importRowSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  occurredAt: z.string().datetime(),
  category: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  bankAccountId: z.string().optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importTransactionsRequestSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(5000),
});
export type ImportTransactionsRequest = z.infer<typeof importTransactionsRequestSchema>;

export const importResultSchema = z.object({
  imported: z.number().int().nonnegative(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
