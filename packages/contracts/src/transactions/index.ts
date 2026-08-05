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

export const createTransactionSchema = z
  .object({
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
    // Bank is required for new movements; card rules are enforced server-side
    // (needs the account type: EXPENSE on a non-cash account requires a card,
    // cash/INCOME forbid one).
    bankAccountId: z.string(),
    cardId: z.string().optional(),
  })
  .refine((t) => t.type !== "INCOME" || !t.cardId, {
    message: "income cannot be linked to a card",
    path: ["cardId"],
  });
export type CreateTransaction = z.infer<typeof createTransactionSchema>;

// `.partial()` isn't available on a ZodEffects (refined) schema, so derive the
// update shape from the inner object and re-apply the income/card refinement.
export const updateTransactionSchema = createTransactionSchema
  .innerType()
  .partial()
  .refine((t) => t.type !== "INCOME" || !t.cardId, {
    message: "income cannot be linked to a card",
    path: ["cardId"],
  });
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;

export const TRANSACTION_PAGE_SIZE = 20;
const TRANSACTION_MAX_PAGE_SIZE = 100;

/** Optional list filters (query params). */
export const transactionFiltersSchema = z.object({
  type: transactionType.optional(),
  bankAccountId: z.string().optional(),
  cardId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Case-insensitive substring match on `category`. Server-side because the
   * list is paginated — filtering the loaded page in the browser would only
   * ever search the rows already fetched. */
  category: z.string().trim().max(120).optional(),
  /**
   * Page size. **Omit to get every match in one response** (no pagination),
   * which is what the aggregate-only consumers rely on (e.g. the dashboard's
   * month view). Views that scroll pass it explicitly.
   */
  limit: z.coerce.number().int().positive().max(TRANSACTION_MAX_PAGE_SIZE).optional(),
  /** Opaque keyset cursor from the previous page's `nextCursor`. */
  cursor: z.string().optional(),
});
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

/**
 * One page of movements. `nextCursor` is `null` on the last page (and always
 * `null` when the request carried no `limit`, since that returns everything).
 */
export const transactionPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
});
export type TransactionPage = z.infer<typeof transactionPageSchema>;

/**
 * Aggregates over the WHOLE filtered set, independent of pagination — the
 * KPI strip, the "N movimientos" count and the category filter's options all
 * have to stay correct no matter how few pages are loaded, so they can't be
 * derived from the rows currently in the browser.
 */
export const transactionSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  currencyTotals: z.array(
    z.object({
      currency: z.string(),
      income: moneyString,
      expense: moneyString,
    }),
  ),
  categories: z.array(z.string()),
});
export type TransactionSummary = z.infer<typeof transactionSummarySchema>;
