import { z } from "zod";

import { customFieldValueSchema } from "../common/custom-field-value";
import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";
import { normalizeFieldName } from "../custom-fields/rules";
import { transactionType } from "../transactions/index";

/**
 * Movement templates (specs/037): a reusable income/expense — everything a hand-made
 * movement carries except its date, the amount optional ("Bencina" vs "Arriendo
 * $450.000"). Using one only PRE-FILLS the movement form; the movement is saved by the
 * ordinary `POST /transactions`, with every rule it has.
 */

/** At most this many templates per person (a technical cap, not a paid feature). */
export const MOVEMENT_TEMPLATE_MAX = 50;
export const MOVEMENT_TEMPLATE_NAME_MAX = 60;

/** Two names are the same template name when this is equal — same rule as custom
 * fields: lower-cased, without accents, spaces collapsed. */
export function normalizeTemplateName(name: string): string {
  return normalizeFieldName(name);
}

/** A positive decimal string (an amount of zero or less isn't an amount). */
const positiveMoney = moneyString.refine((v) => /[1-9]/.test(v) && !v.startsWith("-"), {
  message: "must be positive",
});

export const movementTemplateSchema = z.object({
  id: rowId,
  name: z.string(),
  type: transactionType,
  /** `null` = "monto libre": the person types it every time. */
  amount: moneyString.nullable(),
  currency: z.string().nullable(),
  bankAccountId: rowId.nullable(),
  cardId: rowId.nullable(),
  categoryId: rowId.nullable(),
  recurringExpenseId: rowId.nullable(),
  description: z.string().nullable(),
  observation: z.string().nullable(),
  emisor: z.string().nullable(),
  receptor: z.string().nullable(),
  lugar: z.string().nullable(),
  financeCharge: z.boolean(),
  /** Custom field values by field id — only fields that still exist. */
  customFields: z.record(rowId, customFieldValueSchema),
});
export type MovementTemplate = z.infer<typeof movementTemplateSchema>;

/**
 * Creating a template, and replacing one (`PUT`, the whole state): every reference is
 * optional and ownership-verified server-side before it is stored.
 */
export const saveMovementTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(MOVEMENT_TEMPLATE_NAME_MAX),
    type: transactionType,
    amount: positiveMoney.optional(),
    currency: z.string().trim().length(3).optional(),
    bankAccountId: rowId.optional(),
    cardId: rowId.optional(),
    categoryId: rowId.optional(),
    recurringExpenseId: rowId.optional(),
    description: z.string().trim().max(500).optional(),
    observation: z.string().trim().max(500).optional(),
    emisor: z.string().trim().max(200).optional(),
    receptor: z.string().trim().max(200).optional(),
    lugar: z.string().trim().max(200).optional(),
    financeCharge: z.boolean().optional(),
    customFields: z.record(rowId, customFieldValueSchema).optional(),
  })
  .refine((t) => t.amount === undefined || t.currency !== undefined, {
    message: "an amount needs its currency",
    path: ["currency"],
  })
  .refine((t) => t.cardId === undefined || t.bankAccountId !== undefined, {
    message: "a card belongs to an account",
    path: ["cardId"],
  })
  .refine((t) => !t.financeCharge || t.type === "EXPENSE", {
    message: "a finance charge is always an expense",
    path: ["financeCharge"],
  })
  .refine((t) => !t.financeCharge || t.cardId === undefined, {
    message: "a finance charge is applied to the account, not to a card",
    path: ["cardId"],
  });
export type SaveMovementTemplate = z.infer<typeof saveMovementTemplateSchema>;
