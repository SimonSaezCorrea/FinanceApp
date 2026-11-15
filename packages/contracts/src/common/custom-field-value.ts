import { z } from "zod";

import { rowId as rowIdForMap } from "./row-id";

/**
 * A custom field's value as it crosses the boundary (specs/036): a boolean for a
 * yes/no field, a string for every other type — text, a decimal number, a
 * `YYYY-MM-DD` date or an option's id. Whether it fits the FIELD (its type, its
 * options) is decided by `customFields.parseFieldValue`, which knows the field.
 *
 * Lives in `common` because both `transactions` (a movement carries its values) and
 * `customFields` (which imports `transactions` for its filters) need it.
 */
export const customFieldValueSchema = z.union([z.boolean(), z.string().max(200)]);
export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;

/** Most custom fields one person can have (specs/036); repeated here so `common` stays free of
 * the `customFields` module. Kept equal to `CUSTOM_FIELD_MAX_FIELDS` by a test. */
export const CUSTOM_FIELD_VALUES_MAX_KEYS = 20;

/**
 * An input map of field id → value. Bounded by the number of fields a person can have, so a body
 * can't carry thousands of keys for the API to look up (security run-4 hardening).
 */
export const customFieldValuesMap = <T extends z.ZodTypeAny>(value: T) =>
  z
    .record(rowIdForMap, value)
    .refine((o) => Object.keys(o).length <= CUSTOM_FIELD_VALUES_MAX_KEYS, {
      message: `at most ${CUSTOM_FIELD_VALUES_MAX_KEYS} custom fields`,
    });
