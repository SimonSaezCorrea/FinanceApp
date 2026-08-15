export const FINANCIAL_INSTITUTION_LOOKUP = Symbol("FINANCIAL_INSTITUTION_LOOKUP");

/**
 * Minimal read port over the `financial-institution` table for domains that only
 * need to display an institution's name (`bank-account`). The full reference
 * catalogue (list/filter by country and kind) stays with the `reference` domain
 * until that table's own migration turn; this port exists so `bank-account`'s
 * adapter never queries a table it doesn't own.
 */
export interface FinancialInstitutionLookupPort {
  nameById(id: string): Promise<string | null>;
  /** ISO alpha-2 of the country this institution belongs to — what decides the
   * format an account number must have (a CBU in Argentina, free text in Chile). */
  countryAlpha2ById(id: string): Promise<string | null>;
  /** Batch form for hydrating a list of accounts in one query. */
  namesByIds(ids: string[]): Promise<Map<string, string>>;
}
