import type { customFields } from "@finance/contracts";

import type { CustomField } from "../../custom-field/domain/custom-field.aggregate";
import {
  CustomFieldNotApplicableError,
  CustomFieldNotFoundError,
} from "../../custom-field/domain/errors";
import type { FieldValueWrite } from "../../transaction-field-value/domain/ports/transaction-field-value.repository.port";

export type CreationValue = Omit<FieldValueWrite, "transactionId">;

/**
 * The custom field values a movement the person creates is born with (specs/036,
 * FR-008): what the request names explicitly, plus the default of every field that
 * applies to it and wasn't named. `null` = no value on purpose. A value for a field
 * that doesn't apply is refused, never silently stored. Validated BEFORE anything is
 * written, so a bad value never leaves half a movement behind.
 */
export function resolveCreationValues(
  fields: readonly CustomField[],
  shape: customFields.MovementShape,
  explicit: Record<string, customFields.CustomFieldValue | null> | undefined,
  path = "customFields",
): CreationValue[] {
  const given = explicit ?? {};
  const byId = new Map(fields.map((f) => [f.id, f]));
  for (const id of Object.keys(given)) {
    if (!byId.has(id)) throw new CustomFieldNotFoundError();
  }
  const values: CreationValue[] = [];
  for (const field of fields) {
    const applies = field.appliesTo(shape);
    if (field.id in given) {
      const raw = given[field.id];
      if (raw === null || raw === undefined) continue;
      if (!applies) throw new CustomFieldNotApplicableError(`${path}.${field.id}`);
      values.push({
        customFieldId: field.id,
        type: field.type,
        value: field.parseValue(raw, `${path}.${field.id}`),
      });
    } else if (applies && field.defaultValue !== null) {
      values.push({ customFieldId: field.id, type: field.type, value: field.defaultValue });
    }
  }
  return values;
}

/** The values as a movement's `customFields` in the contract. */
export function valuesRecord(
  values: readonly CreationValue[],
): Record<string, customFields.CustomFieldValue> {
  return Object.fromEntries(values.map((v) => [v.customFieldId, v.value]));
}
