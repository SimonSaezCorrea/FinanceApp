import type { reference } from "@finance/contracts";

export const INSTITUTION_REPOSITORY = Symbol("INSTITUTION_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Global reference
 * data, not user-scoped (see `reference.module.ts`). */
export interface InstitutionRepositoryPort {
  findAll(filters: reference.InstitutionFilters): Promise<reference.Institution[]>;
}
