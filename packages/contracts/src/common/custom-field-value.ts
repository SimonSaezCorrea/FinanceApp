import { z } from "zod";

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
