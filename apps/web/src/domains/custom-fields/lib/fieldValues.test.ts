import { describe, expect, it } from "vitest";

import type { customFields } from "@finance/contracts";

import { creationPayload, defaultsFor, displayValue, fieldsFor, scopeRule } from "./fieldValues";

const field = (over: Partial<customFields.CustomField> = {}): customFields.CustomField => ({
  id: "f1",
  name: "Transferido",
  type: "BOOLEAN",
  options: [],
  scope: { movementKinds: ["EXPENSE"], accountIds: [], cardKinds: ["CREDIT"] },
  scopeBroken: false,
  defaultValue: false,
  showAsColumn: true,
  sortOrder: 0,
  valueCount: 0,
  ...over,
});

const creditExpense = {
  kind: "EXPENSE" as const,
  bankAccountId: "a1",
  cardKind: "CREDIT" as const,
};
const income = { kind: "INCOME" as const, bankAccountId: "a1", cardKind: null };

describe("custom field values (web)", () => {
  it("a broken scope applies to nothing", () => {
    expect(scopeRule(field({ scopeBroken: true })).restrictAccounts).toBe(true);
    expect(fieldsFor([field({ scopeBroken: true })], creditExpense, {})).toEqual([]);
  });

  it("shows applying fields, and fields already holding a value", () => {
    expect(fieldsFor([field()], creditExpense, {})).toHaveLength(1);
    expect(fieldsFor([field()], income, {})).toHaveLength(0);
    expect(fieldsFor([field()], income, { f1: true })).toHaveLength(1);
  });

  it("starts a new movement with the defaults that apply", () => {
    expect(defaultsFor([field()], creditExpense)).toEqual({ f1: false });
    expect(defaultsFor([field()], income)).toEqual({});
  });

  it("sends null for an emptied field and nothing for one that doesn't apply", () => {
    expect(creationPayload([field()], creditExpense, {})).toEqual({ f1: null });
    expect(creationPayload([field()], income, { f1: true })).toEqual({});
  });

  it("reads values in the person's language", () => {
    const t = (k: string) =>
      ({ "customFields.values.yes": "Sí", "customFields.values.no": "No" })[k] ?? k;
    expect(displayValue(field(), true, t, "es")).toBe("Sí");
    expect(
      displayValue(
        field({ type: "OPTION", options: [{ id: "o1", label: "Japón" }] }),
        "o1",
        t,
        "es",
      ),
    ).toBe("Japón");
    expect(displayValue(field({ type: "NUMBER" }), "1234.5", t, "es-CL")).toBe("1.234,5");
  });
});
