import { z } from "zod";

import { cardKind } from "../accounts/index";
import { customFieldValueSchema } from "../common/custom-field-value";
import { moneyString } from "../common/money";
import { rowId } from "../common/row-id";
import { transactionFiltersSchema } from "../transactions/index";
import {
  CUSTOM_FIELD_ASSIGNMENT_MAX,
  CUSTOM_FIELD_MAX_OPTIONS,
  CUSTOM_FIELD_NAME_MAX,
  normalizeFieldName,
  parseFieldValue,
} from "./rules";

export * from "./rules";
export { customFieldValueSchema, type CustomFieldValue } from "../common/custom-field-value";

/** Custom fields on movements (specs/036): fields a person defines for their own
 * movements, with a type, a scope and an optional default. */

export const customFieldType = z.enum(["BOOLEAN", "TEXT", "NUMBER", "DATE", "OPTION"]);
export const customFieldMovementKind = z.enum(["EXPENSE", "INCOME", "TRANSFER"]);

export const customFieldOptionSchema = z.object({
  /** Minted by the client (UUID v7) so a default can name an option before the
   * field exists. Kept forever: values store it, so renaming never touches them. */
  id: rowId,
  label: z.string().trim().min(1).max(CUSTOM_FIELD_NAME_MAX),
});

/** What a field applies to. Every empty list = no restriction in that dimension;
 * naming accounts restricts it to them. */
export const customFieldScopeSchema = z.object({
  movementKinds: z.array(customFieldMovementKind).max(3).default([]),
  accountIds: z.array(rowId).max(200).default([]),
  cardKinds: z.array(cardKind).max(3).default([]),
});
export type CustomFieldScope = z.infer<typeof customFieldScopeSchema>;

export const customFieldSchema = z.object({
  id: rowId,
  name: z.string(),
  type: customFieldType,
  options: z.array(customFieldOptionSchema),
  scope: customFieldScopeSchema,
  /** It named accounts and every one of them was deleted: it applies to nothing
   * until the person edits it. */
  scopeBroken: z.boolean(),
  defaultValue: customFieldValueSchema.nullable(),
  showAsColumn: z.boolean(),
  sortOrder: z.number().int(),
  /** Movements that hold a value — what deleting it would erase (FR-006), and
   * what locks its type (FR-004). */
  valueCount: z.number().int().nonnegative(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

const optionsSchema = z
  .array(customFieldOptionSchema)
  .max(CUSTOM_FIELD_MAX_OPTIONS)
  .refine((options) => new Set(options.map((o) => o.id)).size === options.length, {
    message: "each option id once",
  })
  .refine(
    (options) => new Set(options.map((o) => normalizeFieldName(o.label))).size === options.length,
    { message: "option labels must be different" },
  );

const fieldFields = {
  name: z.string().trim().min(1).max(CUSTOM_FIELD_NAME_MAX),
  type: customFieldType,
  options: optionsSchema.default([]),
  scope: customFieldScopeSchema.default({ movementKinds: [], accountIds: [], cardKinds: [] }),
  defaultValue: customFieldValueSchema.nullable().optional(),
  showAsColumn: z.boolean().optional(),
};

export const createCustomFieldSchema = z
  .object({
    ...fieldFields,
    /** Also give the default to the movements that already exist in scope (FR-005). */
    applyDefaultToExisting: z.boolean().optional(),
  })
  .refine((f) => (f.type === "OPTION") === f.options.length > 0, {
    message: "a list field needs options, and only a list field has them",
    path: ["options"],
  })
  .refine(
    (f) =>
      f.defaultValue === undefined ||
      f.defaultValue === null ||
      parseFieldValue({ type: f.type, options: f.options }, f.defaultValue).ok,
    { message: "the default must be a value of the field", path: ["defaultValue"] },
  );
export type CreateCustomField = z.infer<typeof createCustomFieldSchema>;

/** PATCH: every key optional. `options` is the WHOLE list (ids kept = same option,
 * new ids = new options, missing ids = removed — refused while a value uses one).
 * The type can change only while no movement holds a value. */
export const updateCustomFieldSchema = z.object({
  name: fieldFields.name.optional(),
  type: customFieldType.optional(),
  options: optionsSchema.optional(),
  scope: customFieldScopeSchema.optional(),
  defaultValue: customFieldValueSchema.nullable().optional(),
  showAsColumn: z.boolean().optional(),
});
export type UpdateCustomField = z.infer<typeof updateCustomFieldSchema>;

export const scopeCountRequestSchema = z.object({ scope: customFieldScopeSchema });
export type ScopeCountRequest = z.infer<typeof scopeCountRequestSchema>;
export const scopeCountResponseSchema = z.object({ count: z.number().int().nonnegative() });

/** The movements a bulk action works on: picked one by one, or every movement the
 * current Movimientos filter shows (paging keys are ignored). */
export const assignmentTargetSchema = z.union([
  z.object({ ids: z.array(rowId).min(1).max(CUSTOM_FIELD_ASSIGNMENT_MAX) }),
  z.object({ filter: transactionFiltersSchema.omit({ limit: true, cursor: true }) }),
]);
export type AssignmentTarget = z.infer<typeof assignmentTargetSchema>;

export const assignValuesRequestSchema = z.object({
  target: assignmentTargetSchema,
  /** `null` = take the value away ("sin valor"). */
  value: customFieldValueSchema.nullable(),
});
export type AssignValuesRequest = z.infer<typeof assignValuesRequestSchema>;

export const assignmentPreviewSchema = z.object({
  /** Movements the field applies to: those that would get the value. */
  inScope: z.number().int().nonnegative(),
  /** Movements left out because the field doesn't apply to them. */
  outOfScope: z.number().int().nonnegative(),
  /** In scope and holding a DIFFERENT value today (not counting "no value"). */
  withOtherValue: z.number().int().nonnegative(),
});
export type AssignmentPreview = z.infer<typeof assignmentPreviewSchema>;

export const previousValueSchema = z.object({
  transactionId: rowId,
  value: customFieldValueSchema.nullable(),
});

export const assignValuesResponseSchema = z.object({
  changed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** What each changed movement held before — what "Deshacer" sends back. */
  previous: z.array(previousValueSchema),
});
export type AssignValuesResponse = z.infer<typeof assignValuesResponseSchema>;

export const revertAssignmentRequestSchema = z.object({
  /** The value the assignment set: a movement holding anything else was edited
   * since and is left alone. */
  appliedValue: customFieldValueSchema.nullable(),
  restore: z.array(previousValueSchema).min(1).max(CUSTOM_FIELD_ASSIGNMENT_MAX),
});
export type RevertAssignmentRequest = z.infer<typeof revertAssignmentRequestSchema>;
export const revertAssignmentResponseSchema = z.object({
  restored: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});
export type RevertAssignmentResponse = z.infer<typeof revertAssignmentResponseSchema>;

/** `PATCH /transactions/:id/custom-fields`: `null` takes a value away. */
export const setTransactionValuesRequestSchema = z.object({
  values: z.record(rowId, customFieldValueSchema.nullable()),
});
export type SetTransactionValuesRequest = z.infer<typeof setTransactionValuesRequestSchema>;
export const setTransactionValuesResponseSchema = z.object({
  customFields: z.record(rowId, customFieldValueSchema),
});

/** `GET /transactions/summary/by-field/:fieldId` (FR-016c): per value, how many
 * movements hold it and what they add up to. `key` is `"true"`/`"false"` (yes/no),
 * an option id (list), `"hasValue"` (text, number, date) or `"empty"`. */
export const fieldSummarySchema = z.object({
  buckets: z.array(
    z.object({
      key: z.string(),
      total: z.number().int().nonnegative(),
      currencyTotals: z.array(
        z.object({ currency: z.string(), income: moneyString, expense: moneyString }),
      ),
    }),
  ),
});
export type FieldSummary = z.infer<typeof fieldSummarySchema>;
