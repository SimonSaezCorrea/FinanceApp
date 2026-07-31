import type { reference } from "@finance/contracts";

export const COUNTRY_IDENTIFIER_TYPE_REPOSITORY = Symbol("COUNTRY_IDENTIFIER_TYPE_REPOSITORY");

/**
 * Port for the `country-identifier-type` join table (which national identifier
 * types a country supports, primary first). Pure reference vocabulary: no
 * aggregate, no writes from the API — rows are seeded (`prisma/seed.ts`).
 */
export interface CountryIdentifierTypeRepositoryPort {
  /** Identifier types per country id, primary first. */
  listByCountries(countryIds: string[]): Promise<Map<string, reference.IdentifierType[]>>;
}
