export const COUNTRY_LOOKUP = Symbol("COUNTRY_LOOKUP");

/**
 * Minimal read port over the `country` table for domains that only need to
 * display a country's name (`user`, for the profile's personal-info section).
 * The full reference catalogue (countries with their currencies and identifier
 * types) is served by `domains/reference` — this port exists so `user`'s adapter
 * never queries a table it doesn't own.
 */
export interface CountryLookupPort {
  nameById(id: string): Promise<string | null>;
}
