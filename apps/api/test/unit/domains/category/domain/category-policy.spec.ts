import { describe, expect, it } from "vitest";

import { assertSelectableCategory } from "../../../../../src/domains/category/domain/category-policy";
import type { CategoryRef } from "../../../../../src/domains/category/domain/ports/category-lookup.port";
import { fakeCategoryLookup } from "../../../support/fake-ports";

function lookupWith(category: CategoryRef | null) {
  return fakeCategoryLookup({ findById: async () => category });
}

const expense: CategoryRef = { id: "c1", code: "SUPERMARKET", kind: "EXPENSE", isSystem: false };
const income: CategoryRef = { id: "c2", code: "SALARY", kind: "INCOME", isSystem: false };
const both: CategoryRef = { id: "c3", code: "OTHER", kind: "BOTH", isSystem: false };
const system: CategoryRef = { id: "c4", code: "SAVINGS", kind: "BOTH", isSystem: true };

describe("assertSelectableCategory", () => {
  it("passes when no category was sent", async () => {
    await expect(assertSelectableCategory(lookupWith(null), undefined, "EXPENSE")).resolves.toBe(
      undefined,
    );
    await expect(assertSelectableCategory(lookupWith(null), null, "EXPENSE")).resolves.toBe(
      undefined,
    );
  });

  it("rejects an id that names no catalogue row", async () => {
    await expect(assertSelectableCategory(lookupWith(null), "x", "EXPENSE")).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
      field: "categoryId",
    });
  });

  it("accepts a category of the movement's own type, or one that fits both", async () => {
    await expect(assertSelectableCategory(lookupWith(expense), "c1", "EXPENSE")).resolves.toBe(
      undefined,
    );
    await expect(assertSelectableCategory(lookupWith(both), "c3", "INCOME")).resolves.toBe(
      undefined,
    );
  });

  it("rejects a category of the other type", async () => {
    await expect(
      assertSelectableCategory(lookupWith(income), "c2", "EXPENSE"),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_ALLOWED" });
  });

  it("rejects a system category, whatever the type — even with no type (a transfer)", async () => {
    await expect(
      assertSelectableCategory(lookupWith(system), "c4", "EXPENSE"),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_ALLOWED" });
    await expect(assertSelectableCategory(lookupWith(system), "c4")).rejects.toMatchObject({
      code: "CATEGORY_NOT_ALLOWED",
    });
  });
});
