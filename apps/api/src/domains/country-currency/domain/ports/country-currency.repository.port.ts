export const COUNTRY_CURRENCY_REPOSITORY = Symbol("COUNTRY_CURRENCY_REPOSITORY");

/** A country↔currency link, `isPrimary` marking that country's main currency. */
export interface CountryCurrencyRow {
  countryId: string;
  currencyId: string;
  isPrimary: boolean;
}

/**
 * Port for the `country-currency` join table. Seeded reference data with no HTTP
 * surface of its own today: `GET /countries` and `GET /currencies` each answer
 * from their own table, and nothing yet asks "which currencies does this country
 * use" (there is no FX conversion in this app — see docs/PENDING.md). The port
 * exists so the table has exactly one owner the day something needs it, instead
 * of another domain reaching into it.
 */
export interface CountryCurrencyRepositoryPort {
  listByCountry(countryId: string): Promise<CountryCurrencyRow[]>;
  primaryForCountry(countryId: string): Promise<CountryCurrencyRow | null>;
}
