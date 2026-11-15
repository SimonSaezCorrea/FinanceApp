import { describe, expect, it } from "vitest";

import { CUSTOM_FIELD_MAX_FIELDS } from "../custom-fields/rules";
import {
  CUSTOM_FIELD_VALUES_MAX_KEYS,
  customFieldValueSchema,
  customFieldValuesMap,
} from "./custom-field-value";

const id = (i: number) => `01890a5d-ac96-774b-bcce-${String(i).padStart(12, "0")}`;

describe("customFieldValuesMap", () => {
  it("allows as many keys as a person can have fields", () => {
    expect(CUSTOM_FIELD_VALUES_MAX_KEYS).toBe(CUSTOM_FIELD_MAX_FIELDS);
  });

  it("refuses a map with more keys than fields can exist (security run-4)", () => {
    const schema = customFieldValuesMap(customFieldValueSchema);
    const map = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [id(i), true]));
    expect(schema.safeParse(map(CUSTOM_FIELD_VALUES_MAX_KEYS)).success).toBe(true);
    expect(schema.safeParse(map(CUSTOM_FIELD_VALUES_MAX_KEYS + 1)).success).toBe(false);
  });
});
