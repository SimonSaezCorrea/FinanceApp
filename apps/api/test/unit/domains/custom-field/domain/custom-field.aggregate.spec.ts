import { describe, expect, it } from "vitest";

import { CustomField } from "../../../../../src/domains/custom-field/domain/custom-field.aggregate";
import {
  CustomFieldInvalidValueError,
  CustomFieldOptionInUseError,
  CustomFieldTypeLockedError,
} from "../../../../../src/domains/custom-field/domain/errors";

const OPT_A = "019a0000-0000-7000-8000-0000000000a1";
const OPT_B = "019a0000-0000-7000-8000-0000000000a2";
const ACCOUNT = "019a0000-0000-7000-8000-0000000000c1";

function field(type: "BOOLEAN" | "OPTION" = "BOOLEAN") {
  const plan = CustomField.planCreation(
    "u1",
    {
      name: "  Viaje ",
      type,
      options:
        type === "OPTION"
          ? [
              { id: OPT_A, label: "Japón" },
              { id: OPT_B, label: "Perú" },
            ]
          : [],
      scope: { movementKinds: ["EXPENSE"], accountIds: [ACCOUNT], cardKinds: [] },
      defaultValue: type === "OPTION" ? OPT_A : false,
    },
    3,
  );
  return CustomField.fromPersistence({ id: "f1", ...plan });
}

const noUsage = { valueCount: 0, usedOptionIds: new Set<string>() };

describe("CustomField.planCreation", () => {
  it("trims the name, keys it and restricts the scope by the accounts it names", () => {
    const f = field();
    expect(f.name).toBe("Viaje");
    expect(f.nameKey).toBe("viaje");
    expect(f.scope.restrictAccounts).toBe(true);
    expect(f.sortOrder).toBe(3);
    expect(f.defaultValue).toBe(false);
  });

  it("refuses a default that isn't a value of the field", () => {
    expect(() =>
      CustomField.planCreation(
        "u1",
        {
          name: "x",
          type: "NUMBER",
          options: [],
          scope: { movementKinds: [], accountIds: [], cardKinds: [] },
          defaultValue: "abc",
        },
        0,
      ),
    ).toThrow(CustomFieldInvalidValueError);
  });
});

describe("CustomField.applyUpdate", () => {
  it("locks the type once a movement holds a value", () => {
    expect(() => field().applyUpdate({ type: "TEXT" }, { ...noUsage, valueCount: 1 })).toThrow(
      CustomFieldTypeLockedError,
    );
  });

  it("changes the type while unused, dropping a default that no longer fits", () => {
    const f = field();
    f.applyUpdate({ type: "TEXT" }, noUsage);
    expect(f.type).toBe("TEXT");
    expect(f.defaultValue).toBeNull();
  });

  it("can't remove an option in use, can rename it", () => {
    const f = field("OPTION");
    expect(() =>
      f.applyUpdate(
        { options: [{ id: OPT_A, label: "Japón" }] },
        { valueCount: 3, usedOptionIds: new Set([OPT_B]) },
      ),
    ).toThrow(CustomFieldOptionInUseError);
    f.applyUpdate(
      {
        options: [
          { id: OPT_A, label: "Japón 2027" },
          { id: OPT_B, label: "Perú" },
        ],
      },
      noUsage,
    );
    expect(f.options[0]!.label).toBe("Japón 2027");
  });

  it("removing the option the default named drops the default", () => {
    const f = field("OPTION");
    f.applyUpdate({ options: [{ id: OPT_B, label: "Perú" }] }, noUsage);
    expect(f.defaultValue).toBeNull();
  });

  it("changing the scope keeps nothing else", () => {
    const f = field();
    f.applyUpdate({ scope: { movementKinds: [], accountIds: [], cardKinds: ["CREDIT"] } }, noUsage);
    expect(f.scope).toEqual({
      movementKinds: [],
      restrictAccounts: false,
      accountIds: [],
      cardKinds: ["CREDIT"],
    });
    expect(f.defaultValue).toBe(false);
  });
});

describe("CustomField scope", () => {
  it("an account-restricted field left with no accounts is broken and applies to nothing", () => {
    const f = CustomField.fromPersistence({
      ...field().toProps(),
      scope: { movementKinds: [], restrictAccounts: true, accountIds: [], cardKinds: [] },
    });
    expect(f.scopeBroken).toBe(true);
    expect(f.appliesTo({ kind: "EXPENSE", bankAccountId: ACCOUNT, cardKind: null })).toBe(false);
  });

  it("parseValue canonicalises or refuses", () => {
    expect(field().parseValue(true)).toBe(true);
    expect(() => field().parseValue("true")).toThrow(CustomFieldInvalidValueError);
  });
});
