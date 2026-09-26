import type { reference } from "@finance/contracts";

export const CATEGORY_REPOSITORY = Symbol("CATEGORY_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Global reference
 * data, not user-scoped: every user sees the same catalogue. */
export interface CategoryRepositoryPort {
  /** The whole catalogue, system rows included (the web needs them to label
   * server-assigned movements), in picker order. */
  findAll(): Promise<reference.Category[]>;
}
