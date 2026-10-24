import { describe, expect, it } from "vitest";

import { CustomField } from "../../../../../src/domains/custom-field/domain/custom-field.aggregate";
import {
  CustomFieldNotApplicableError,
  CustomFieldNotFoundError,
} from "../../../../../src/domains/custom-field/domain/errors";
import { resolveCreationValues } from "../../../../../src/domains/transaction/application/custom-field-values";

const A = "019a0000-0000-7000-8000-0000000000f1";
const T = "019a0000-0000-7000-8000-0000000000f2";
const noScope = { movementKinds: [], restrictAccounts: false, accountIds: [], cardKinds: [] };

const expenses = CustomField.fromPersistence({
  id: A,
  userId: "u1",
  name: "Transferido",
  nameKey: "transferido",
  type: "BOOLEAN",
  options: [],
  scope: { ...noScope, movementKinds: ["EXPENSE"] },
  defaultValue: false,
  showAsColumn: false,
  sortOrder: 0,
});
const transfers = CustomField.fromPersistence({
  ...expenses.toProps(),
  id: T,
  name: "Motivo",
  nameKey: "motivo",
  type: "TEXT",
  scope: { ...noScope, movementKinds: ["TRANSFER"] },
  defaultValue: null,
});

const expense = { kind: "EXPENSE" as const, bankAccountId: "a1", cardKind: null };
const transferLeg = { kind: "TRANSFER" as const, bankAccountId: "a1", cardKind: null };

describe("resolveCreationValues (specs/036, FR-008)", () => {
  it("takes the default of a field that applies", () => {
    expect(resolveCreationValues([expenses, transfers], expense, undefined)).toEqual([
      { customFieldId: A, type: "BOOLEAN", value: false },
    ]);
  });

  it("an explicit value wins; null means no value on purpose", () => {
    expect(resolveCreationValues([expenses], expense, { [A]: true })).toEqual([
      { customFieldId: A, type: "BOOLEAN", value: true },
    ]);
    expect(resolveCreationValues([expenses], expense, { [A]: null })).toEqual([]);
  });

  it("a transfer leg is TRANSFER: an expense-only field doesn't apply to it", () => {
    expect(resolveCreationValues([expenses, transfers], transferLeg, { [T]: " ahorro " })).toEqual([
      { customFieldId: T, type: "TEXT", value: "ahorro" },
    ]);
    expect(() => resolveCreationValues([expenses], transferLeg, { [A]: true })).toThrow(
      CustomFieldNotApplicableError,
    );
  });

  it("an unknown field is not found", () => {
    expect(() =>
      resolveCreationValues([expenses], expense, { "019a0000-0000-7000-8000-0000000000ff": true }),
    ).toThrow(CustomFieldNotFoundError);
  });
});
