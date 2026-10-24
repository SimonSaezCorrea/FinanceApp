import { describe, expect, it, vi } from "vitest";

import {
  CustomFieldFilterInvalidError,
  CustomFieldNotFoundError,
} from "../../../../../../src/domains/custom-field/domain/errors";
import { CustomField } from "../../../../../../src/domains/custom-field/domain/custom-field.aggregate";
import { resolveListFilter } from "../../../../../../src/domains/transaction/application/queries/transaction-list-filter";
import {
  fakeCardAccountRepo,
  fakeCustomFieldRepo,
  fakeFieldValueRepo,
} from "../../../../support/fake-ports";

const FIELD = "019a0000-0000-7000-8000-0000000000f1";

function transferido() {
  return CustomField.fromPersistence({
    id: FIELD,
    userId: "u1",
    name: "Transferido",
    nameKey: "transferido",
    type: "BOOLEAN",
    options: [],
    scope: {
      movementKinds: ["EXPENSE"],
      restrictAccounts: false,
      accountIds: [],
      cardKinds: ["CREDIT"],
    },
    defaultValue: false,
    showAsColumn: false,
    sortOrder: 0,
  });
}

function deps(overrides: { idsMatching?: (...args: unknown[]) => Promise<string[]> } = {}) {
  return {
    fields: fakeCustomFieldRepo({ findOwned: vi.fn(async () => transferido()) }),
    values: fakeFieldValueRepo(
      overrides.idsMatching ? { idsMatching: overrides.idsMatching as never } : {},
    ),
    cards: fakeCardAccountRepo({
      kindsForUser: vi.fn(
        async () =>
          new Map([
            ["c-credit", "CREDIT" as const],
            ["c-debit", "DEBIT" as const],
          ]),
      ),
    }),
  };
}

describe("resolveListFilter — custom field filter (specs/036)", () => {
  it("leaves a filter without a field untouched", async () => {
    const where = await resolveListFilter(deps(), "u1", { categoryId: FIELD });
    expect(where).not.toHaveProperty("ids");
    expect(where.categoryId).toBe(FIELD);
  });

  it("an exact value becomes the ids holding it", async () => {
    const idsMatching = vi.fn(async () => ["t1", "t2"]);
    const where = await resolveListFilter(deps({ idsMatching }), "u1", { cf: FIELD, cfv: "false" });
    expect(idsMatching).toHaveBeenCalledWith("u1", FIELD, {
      kind: "equals",
      type: "BOOLEAN",
      value: false,
    });
    expect(where.ids).toEqual(["t1", "t2"]);
  });

  it("'no value' excludes the ids holding one, within the field's scope", async () => {
    const idsMatching = vi.fn(async () => ["t9"]);
    const where = await resolveListFilter(deps({ idsMatching }), "u1", {
      cf: FIELD,
      cfEmpty: "true",
    });
    expect(where.excludeIds).toEqual(["t9"]);
    expect(where.scope).toEqual({ kinds: ["EXPENSE"], accountIds: null, cardIds: ["c-credit"] });
  });

  it("needs exactly one predicate that fits the field", async () => {
    await expect(resolveListFilter(deps(), "u1", { cf: FIELD })).rejects.toBeInstanceOf(
      CustomFieldFilterInvalidError,
    );
    await expect(
      resolveListFilter(deps(), "u1", { cf: FIELD, cfv: "maybe" }),
    ).rejects.toBeInstanceOf(CustomFieldFilterInvalidError);
    await expect(
      resolveListFilter(deps(), "u1", { cf: FIELD, cfText: "x" }),
    ).rejects.toBeInstanceOf(CustomFieldFilterInvalidError);
  });

  it("someone else's field is not found", async () => {
    const d = { ...deps(), fields: fakeCustomFieldRepo() };
    await expect(resolveListFilter(d, "u1", { cf: FIELD, cfv: "true" })).rejects.toBeInstanceOf(
      CustomFieldNotFoundError,
    );
  });
});
