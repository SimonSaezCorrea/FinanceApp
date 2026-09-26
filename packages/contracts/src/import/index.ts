import { z } from "zod";

import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";

/**
 * Importing movements into ONE account from a spreadsheet the user exported from
 * their bank. The file is read and mapped in the browser; the API receives
 * already-typed rows and applies them exactly like movements created by hand:
 * each one moves the account's balance (and, on a credit card account, its credit
 * pool and open billing period) and obeys the same movement rules. The currency is
 * always the account's own — this app does no FX conversion.
 */

/** Most rows one import may carry — a bank statement export is typically a month
 * or a year; anything bigger should be split. */
export const IMPORT_MAX_ROWS = 2000;

/** A positive decimal string: the sign lives in `type`, same as a movement. */
const positiveMoney = moneyString.refine((v) => !v.startsWith("-") && Number(v) > 0, {
  message: "must be a positive amount",
});

/** Everything a hand-made movement can carry, except what the account decides
 * (currency) or what doesn't come from a statement (attachments). */
export const importRowSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: positiveMoney,
  occurredAt: z.string().datetime(),
  description: z.string().trim().max(500).optional(),
  observation: z.string().trim().max(500).optional(),
  emisor: z.string().trim().max(200).optional(),
  receptor: z.string().trim().max(200).optional(),
  lugar: z.string().trim().max(200).optional(),
  /** Same rule as a single movement: one the user may pick for `type`. */
  categoryId: rowId.optional(),
  /** A card OF THIS ACCOUNT. On a credit card account an expense without one goes
   * on the primary card. */
  cardId: rowId.optional(),
  /** An issuer charge on a credit card account (interest, fee): no card. */
  financeCharge: z.boolean().optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importTransactionsRequestSchema = z.object({
  /** The account every row lands on — ownership-verified by the API. */
  bankAccountId: rowId,
  rows: z.array(importRowSchema).min(1).max(IMPORT_MAX_ROWS),
});
export type ImportTransactionsRequest = z.infer<typeof importTransactionsRequestSchema>;

export const importResultSchema = z.object({
  imported: z.number().int().nonnegative(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
