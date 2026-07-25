import type { reference } from "@finance/contracts";

export const COUNTRY_REPOSITORY = Symbol("COUNTRY_REPOSITORY");

/**
 * Domain-owned port (Adapter, FR-011) — zero Prisma imports. Global reference
 * data, not user-scoped (deliberate, documented exception to Constitution
 * Principle II — see `reference.module.ts`).
 *
 * There is no aggregate for this domain (pure read model, FR-017's "read-only
 * still gets full structure" clarification) so the port returns the contract
 * shape directly; mapping from the persistence row lives in the Prisma
 * adapter, the only place allowed to know about it.
 */
export interface CountryRepositoryPort {
  findAll(): Promise<reference.Country[]>;
}
