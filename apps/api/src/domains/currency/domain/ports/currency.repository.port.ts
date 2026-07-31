import type { reference } from "@finance/contracts";

export const CURRENCY_REPOSITORY = Symbol("CURRENCY_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Global reference
 * data, not user-scoped (see `reference.module.ts`). */
export interface CurrencyRepositoryPort {
  findAll(): Promise<reference.Currency[]>;
}
