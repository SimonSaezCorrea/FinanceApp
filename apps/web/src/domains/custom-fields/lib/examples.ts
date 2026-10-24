import type { customFields } from "@finance/contracts";

import { tempRowId } from "../../import/lib/tempRowId";
import {
  emptyCustomFieldForm,
  type CustomFieldFormValue,
} from "../components/CustomFieldFormPanel";

export const EXAMPLE_KEYS = ["transferred", "refundable", "trip", "paidBy"] as const;
export type ExampleKey = (typeof EXAMPLE_KEYS)[number];

export const EXAMPLE_TYPE: Record<ExampleKey, customFields.CustomFieldType> = {
  transferred: "BOOLEAN",
  refundable: "BOOLEAN",
  trip: "TEXT",
  paidBy: "OPTION",
};

/**
 * A ready-made column the empty state offers: the form opens filled with it, in the person's
 * language, and they still review and create it themselves.
 */
export function exampleForm(key: ExampleKey, t: (key: string) => string): CustomFieldFormValue {
  const base = emptyCustomFieldForm();
  const name = t(`customFields.examples.${key}.name`);
  const expenses = { ...base.scope, movementKinds: ["EXPENSE" as const] };
  switch (key) {
    case "transferred":
      return {
        ...base,
        name,
        type: "BOOLEAN",
        scope: { ...expenses, cardKinds: ["CREDIT"] },
        defaultValue: false,
        showAsColumn: true,
      };
    case "refundable":
      return { ...base, name, type: "BOOLEAN", scope: expenses, showAsColumn: true };
    case "trip":
      return { ...base, name, type: "TEXT" };
    case "paidBy":
      return {
        ...base,
        name,
        type: "OPTION",
        scope: expenses,
        options: [
          { id: tempRowId(), label: t("customFields.examples.paidBy.me") },
          { id: tempRowId(), label: t("customFields.examples.paidBy.partner") },
        ],
        showAsColumn: true,
      };
  }
}
