import { z } from "zod";

import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";

export * from "./attachments";

/** Transactions domain contracts. Amounts are positive decimal strings; sign is the `type`. */

export const transactionType = z.enum(["INCOME", "EXPENSE"]);
export type TransactionType = z.infer<typeof transactionType>;

export const transactionSchema = z.object({
  id: rowId,
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
  bankAccountId: rowId.nullable(),
  cardId: rowId.nullable(),
  /** An issuer charge on the credit account itself (interest, fee, insurance) —
   * no card made it, and the app never computes it: it is read off the statement. */
  financeCharge: z.boolean(),
  installmentPlanId: rowId.nullable(),
  /**
   * Ties the two rows of a transfer together (EXPENSE on the source account +
   * INCOME on the destination). `null` on ordinary income/expense — the `type`
   * enum deliberately does NOT grow a TRANSFER value, so use `isTransfer`.
   */
  transferGroupId: rowId.nullable(),
  /** The `Debt` this movement pays — set by `register-payment`/`settle`, the same
   * way `installmentPlanId` is set by an instalment payment. */
  debtId: rowId.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/** A movement is a transfer leg when it carries a group id. */
export function isTransfer(t: Pick<Transaction, "transferGroupId">): boolean {
  return t.transferGroupId != null;
}

/**
 * Where a movement came from — derived from the fields already on the row,
 * never stored on its own (so it can't drift from the fields it reads). Used
 * by the Movements detail view to answer "¿de dónde viene esto?" instead of
 * leaving every non-manual movement looking hand-typed.
 */
export type TransactionSource =
  | { kind: "TRANSFER" }
  | { kind: "INSTALLMENT"; installmentPlanId: string }
  | { kind: "INSTALLMENT_INTEREST"; installmentPlanId: string }
  | { kind: "FINANCE_CHARGE" }
  | { kind: "DEBT"; debtId: string }
  | { kind: "MANUAL" };

export function sourceOf(
  t: Pick<Transaction, "transferGroupId" | "installmentPlanId" | "financeCharge" | "debtId">,
): TransactionSource {
  if (t.transferGroupId !== null) return { kind: "TRANSFER" };
  if (t.installmentPlanId !== null) {
    return t.financeCharge
      ? { kind: "INSTALLMENT_INTEREST", installmentPlanId: t.installmentPlanId }
      : { kind: "INSTALLMENT", installmentPlanId: t.installmentPlanId };
  }
  // An issuer charge that ISN'T tied to a specific plan (interest/fee on the
  // card account itself) — checked after `installmentPlanId` so a plan's own
  // interest keeps reading as INSTALLMENT_INTEREST, not this.
  if (t.financeCharge) return { kind: "FINANCE_CHARGE" };
  if (t.debtId !== null) return { kind: "DEBT", debtId: t.debtId };
  return { kind: "MANUAL" };
}

/** Which leg of the transfer this row is — `null` for an ordinary movement. */
export function transferSide(
  t: Pick<Transaction, "transferGroupId" | "type">,
): "OUT" | "IN" | null {
  if (!isTransfer(t)) return null;
  return t.type === "EXPENSE" ? "OUT" : "IN";
}

/** The plain field shape. Kept apart from the refinements because each `.refine()`
 * wraps the schema in a ZodEffects, and `.partial()` (the PATCH shape) only exists
 * on the object — same split `accounts` uses for its own fields. */
const transactionFieldsSchema = z.object({
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
  bankAccountId: rowId,
  cardId: rowId.optional(),
  /** An issuer charge on the credit account itself (interest, annual fee,
   * insurance): no card made it, so the "a credit-line expense needs a card"
   * rule doesn't apply. It still feeds the credit pool. */
  financeCharge: z.boolean().optional(),
});

export const createTransactionSchema = transactionFieldsSchema
  .refine((t) => t.type !== "INCOME" || !t.cardId, {
    message: "income cannot be linked to a card",
    path: ["cardId"],
  })
  .refine((t) => !t.financeCharge || t.type === "EXPENSE", {
    message: "a finance charge is always an expense",
    path: ["financeCharge"],
  })
  .refine((t) => !t.financeCharge || !t.cardId, {
    message: "a finance charge is applied to the account, not to a card",
    path: ["cardId"],
  });
export type CreateTransaction = z.infer<typeof createTransactionSchema>;

// `.partial()` isn't available on a ZodEffects (refined) schema, so derive the
// update shape from the plain fields and re-apply the income/card refinement.
//
// zod v4's `.partial()` keeps a `.default(...)` active even when the key is
// absent, unlike v3 — left alone, an omitted `currency` on a PATCH would silently
// reset it to "USD" (`patch.currency !== undefined` can't tell that apart from a
// real value). Re-declared without the default here.
export const updateTransactionSchema = transactionFieldsSchema
  .partial()
  .extend({ currency: z.string().trim().length(3).optional() })
  .refine((t) => t.type !== "INCOME" || !t.cardId, {
    message: "income cannot be linked to a card",
    path: ["cardId"],
  });
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;

/**
 * A transfer between two of the user's own accounts. It is created and edited as
 * a UNIT: the API writes both rows (and moves both balances) atomically, so
 * `createTransactionSchema` above deliberately has no `transferGroupId`.
 * Currencies are each side's own account currency and are never compared —
 * this app performs no FX conversion.
 */
const transferFieldsSchema = z.object({
  fromBankAccountId: rowId,
  toBankAccountId: rowId,
  amountOut: moneyString,
  amountIn: moneyString,
  currencyOut: z.string().trim().length(3),
  currencyIn: z.string().trim().length(3),
  occurredAt: z.string().datetime(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(120).optional(),
  observation: z.string().trim().max(500).optional(),
  emisor: z.string().trim().max(200).optional(),
  receptor: z.string().trim().max(200).optional(),
  lugar: z.string().trim().max(200).optional(),
});

export const createTransferSchema = transferFieldsSchema.refine(
  (t) => t.fromBankAccountId !== t.toBankAccountId,
  {
    message: "a transfer needs two different accounts",
    path: ["toBankAccountId"],
  },
);
export type CreateTransfer = z.infer<typeof createTransferSchema>;

export const updateTransferSchema = transferFieldsSchema
  .partial()
  .refine(
    (t) => !t.fromBankAccountId || !t.toBankAccountId || t.fromBankAccountId !== t.toBankAccountId,
    {
      message: "a transfer needs two different accounts",
      path: ["toBankAccountId"],
    },
  );
export type UpdateTransfer = z.infer<typeof updateTransferSchema>;

/** Both rows of a transfer, as one unit. Named by role — `in` reads badly in TS. */
export const transferSchema = z.object({
  transferGroupId: rowId,
  /** EXPENSE on the source account. */
  outgoing: transactionSchema,
  /** INCOME on the destination account. */
  incoming: transactionSchema,
});
export type Transfer = z.infer<typeof transferSchema>;

export const TRANSACTION_PAGE_SIZE = 20;
const TRANSACTION_MAX_PAGE_SIZE = 100;

/** Optional list filters (query params). */
export const transactionFiltersSchema = z.object({
  type: transactionType.optional(),
  bankAccountId: rowId.optional(),
  cardId: rowId.optional(),
  /** Every movement linked to one billing period — a statement's detail view. */
  creditStatementId: rowId.optional(),
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
 *
 * `currencyTotals` and `categories` EXCLUDE transfer legs (FR-017): moving money
 * between your own accounts is neither income nor expense. `total` counts them —
 * they are real rows of the filtered set the list shows.
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
