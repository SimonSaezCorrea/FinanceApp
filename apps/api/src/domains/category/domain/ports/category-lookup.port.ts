import type { reference } from "@finance/contracts";

export const CATEGORY_LOOKUP = Symbol("CATEGORY_LOOKUP");

/** What a writer needs to know about one category to decide if it may be used. */
export type CategoryRef = Pick<reference.Category, "id" | "code" | "kind" | "isSystem">;

/**
 * Narrow read port over the `category` table for the domains that store a
 * `categoryId` (`transaction`, `installment-plan`, `recurring-expense`, `import`)
 * and for the handlers that assign a system category on their own (a savings
 * contribution, a statement payment…). Exists so none of their adapters ever
 * queries a table it doesn't own (Constitution VI).
 */
export interface CategoryLookupPort {
  findById(id: string): Promise<CategoryRef | null>;
  /**
   * The id of a system category. A missing row is a seeding defect, not a user
   * error — the adapter throws rather than silently writing an uncategorised
   * movement.
   */
  idForSystemCode(code: reference.SystemCategoryCode): Promise<string>;
}
