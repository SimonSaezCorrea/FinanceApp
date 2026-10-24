import { describe, expect, it } from "vitest";

import { coverTransferSchema, transactionFiltersSchema } from "../transactions/index";
import {
  assignValuesRequestSchema,
  createCustomFieldSchema,
  fieldAppliesTo,
  fieldShowsFor,
  movementKindOf,
  normalizeFieldName,
  parseFieldValue,
  updateCustomFieldSchema,
  type CustomFieldScopeRule,
} from "./index";

const ID_A = "019a0000-0000-7000-8000-000000000001";
const ID_B = "019a0000-0000-7000-8000-000000000002";
const ACCOUNT = "019a0000-0000-7000-8000-0000000000aa";

const noScope: CustomFieldScopeRule = {
  movementKinds: [],
  restrictAccounts: false,
  accountIds: [],
  cardKinds: [],
};

describe("normalizeFieldName", () => {
  it("ignores case, accents and repeated spaces", () => {
    expect(normalizeFieldName("  Transferído   a MACH ")).toBe("transferido a mach");
    expect(normalizeFieldName("TRANSFERIDO")).toBe(normalizeFieldName("transferido"));
  });
});

describe("parseFieldValue", () => {
  const options = [{ id: ID_A, label: "Japón" }];

  it("yes/no takes only booleans", () => {
    expect(parseFieldValue({ type: "BOOLEAN", options: [] }, true)).toEqual({
      ok: true,
      value: true,
    });
    expect(parseFieldValue({ type: "BOOLEAN", options: [] }, "true").ok).toBe(false);
  });

  it("text is trimmed and 1–200 characters", () => {
    expect(parseFieldValue({ type: "TEXT", options: [] }, "  hola ")).toEqual({
      ok: true,
      value: "hola",
    });
    expect(parseFieldValue({ type: "TEXT", options: [] }, "   ").ok).toBe(false);
    expect(parseFieldValue({ type: "TEXT", options: [] }, "x".repeat(201)).ok).toBe(false);
  });

  it("number is a decimal string, canonicalised", () => {
    expect(parseFieldValue({ type: "NUMBER", options: [] }, "12.500")).toEqual({
      ok: true,
      value: "12.5",
    });
    expect(parseFieldValue({ type: "NUMBER", options: [] }, "-3")).toEqual({
      ok: true,
      value: "-3",
    });
    expect(parseFieldValue({ type: "NUMBER", options: [] }, "1,5").ok).toBe(false);
    expect(parseFieldValue({ type: "NUMBER", options: [] }, "1.123456789").ok).toBe(false);
  });

  it("date is a real YYYY-MM-DD", () => {
    expect(parseFieldValue({ type: "DATE", options: [] }, "2026-02-28").ok).toBe(true);
    expect(parseFieldValue({ type: "DATE", options: [] }, "2026-02-30").ok).toBe(false);
    expect(parseFieldValue({ type: "DATE", options: [] }, "28-02-2026").ok).toBe(false);
  });

  it("a list value is one of its option ids", () => {
    expect(parseFieldValue({ type: "OPTION", options }, ID_A).ok).toBe(true);
    expect(parseFieldValue({ type: "OPTION", options }, ID_B).ok).toBe(false);
  });
});

describe("fieldAppliesTo", () => {
  const creditExpense = {
    kind: "EXPENSE" as const,
    bankAccountId: ACCOUNT,
    cardKind: "CREDIT" as const,
  };

  it("no restriction applies to everything", () => {
    expect(fieldAppliesTo(noScope, { kind: "INCOME", bankAccountId: null, cardKind: null })).toBe(
      true,
    );
  });

  it("checks every restricted dimension", () => {
    const scope = {
      ...noScope,
      movementKinds: ["EXPENSE" as const],
      cardKinds: ["CREDIT" as const],
    };
    expect(fieldAppliesTo(scope, creditExpense)).toBe(true);
    expect(fieldAppliesTo(scope, { ...creditExpense, kind: "INCOME" })).toBe(false);
    expect(fieldAppliesTo(scope, { ...creditExpense, cardKind: "DEBIT" })).toBe(false);
  });

  it("a card-kind restriction leaves out movements without a card", () => {
    expect(
      fieldAppliesTo({ ...noScope, cardKinds: ["CREDIT"] }, { ...creditExpense, cardKind: null }),
    ).toBe(false);
  });

  it("accounts restrict; restricting to none applies to nothing", () => {
    expect(
      fieldAppliesTo({ ...noScope, restrictAccounts: true, accountIds: [ACCOUNT] }, creditExpense),
    ).toBe(true);
    expect(
      fieldAppliesTo({ ...noScope, restrictAccounts: true, accountIds: [] }, creditExpense),
    ).toBe(false);
  });

  it("a transfer leg is TRANSFER, whatever its type", () => {
    expect(movementKindOf({ type: "EXPENSE", transferGroupId: ID_A })).toBe("TRANSFER");
    expect(movementKindOf({ type: "EXPENSE", transferGroupId: null })).toBe("EXPENSE");
  });

  it("a value out of scope still shows", () => {
    const scope = { ...noScope, movementKinds: ["INCOME" as const] };
    expect(fieldShowsFor(scope, creditExpense, false)).toBe(false);
    expect(fieldShowsFor(scope, creditExpense, true)).toBe(true);
  });
});

describe("createCustomFieldSchema", () => {
  it("accepts the 'Transferido' field", () => {
    const parsed = createCustomFieldSchema.parse({
      name: "Transferido",
      type: "BOOLEAN",
      scope: { movementKinds: ["EXPENSE"], cardKinds: ["CREDIT"] },
      defaultValue: false,
    });
    expect(parsed.scope.accountIds).toEqual([]);
    expect(parsed.options).toEqual([]);
  });

  it("a list needs options and only a list has them", () => {
    expect(createCustomFieldSchema.safeParse({ name: "Viaje", type: "OPTION" }).success).toBe(
      false,
    );
    expect(
      createCustomFieldSchema.safeParse({
        name: "Nota",
        type: "TEXT",
        options: [{ id: ID_A, label: "x" }],
      }).success,
    ).toBe(false);
  });

  it("refuses repeated option labels and a default that isn't a value", () => {
    expect(
      createCustomFieldSchema.safeParse({
        name: "Viaje",
        type: "OPTION",
        options: [
          { id: ID_A, label: "Japón" },
          { id: ID_B, label: "japon" },
        ],
      }).success,
    ).toBe(false);
    expect(
      createCustomFieldSchema.safeParse({
        name: "Transferido",
        type: "BOOLEAN",
        defaultValue: "no",
      }).success,
    ).toBe(false);
  });

  it("refuses an empty or too long name", () => {
    expect(createCustomFieldSchema.safeParse({ name: " ", type: "TEXT" }).success).toBe(false);
    expect(createCustomFieldSchema.safeParse({ name: "x".repeat(41), type: "TEXT" }).success).toBe(
      false,
    );
  });

  it("an update may carry only some keys", () => {
    expect(updateCustomFieldSchema.parse({ showAsColumn: true })).toEqual({ showAsColumn: true });
  });
});

describe("bulk and filter shapes", () => {
  it("an assignment targets ids or a filter", () => {
    expect(
      assignValuesRequestSchema.safeParse({ target: { ids: [ID_A] }, value: true }).success,
    ).toBe(true);
    expect(
      assignValuesRequestSchema.safeParse({
        target: { filter: { cf: ID_A, cfv: "false" } },
        value: true,
      }).success,
    ).toBe(true);
    expect(assignValuesRequestSchema.safeParse({ target: { ids: [] }, value: true }).success).toBe(
      false,
    );
  });

  it("the movement filters take a custom field predicate", () => {
    expect(transactionFiltersSchema.parse({ cf: ID_A, cfEmpty: "true" })).toMatchObject({
      cfEmpty: "true",
    });
  });

  it("covering needs two different accounts", () => {
    const base = { fieldId: ID_A, target: { ids: [ID_B] }, value: true, fromBankAccountId: ID_A };
    expect(coverTransferSchema.safeParse({ ...base, toBankAccountId: ID_B }).success).toBe(true);
    expect(coverTransferSchema.safeParse({ ...base, toBankAccountId: ID_A }).success).toBe(false);
  });
});
