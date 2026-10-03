import { reference } from "@finance/contracts";

import { CategoryNotAllowedError, CategoryNotFoundError } from "./errors";
import type { CategoryLookupPort } from "./ports/category-lookup.port";

/**
 * Validates a body-supplied `categoryId` before it is persisted: it must exist and
 * be one the user may pick for `type` (`reference.isCategorySelectable` — the same
 * predicate the web's pickers use, so both sides agree). `null`/`undefined` pass:
 * a category is always optional. `type` omitted (a transfer) only rules out system
 * rows.
 */
export async function assertSelectableCategory(
  lookup: CategoryLookupPort,
  categoryId: string | null | undefined,
  type?: "INCOME" | "EXPENSE",
): Promise<void> {
  if (!categoryId) return;
  const category = await lookup.findById(categoryId);
  if (!category) throw new CategoryNotFoundError();
  if (!reference.isCategorySelectable(category, type)) throw new CategoryNotAllowedError();
}
