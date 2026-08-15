import type { accounts } from "@finance/contracts";

export const INSTITUTION_ACCOUNT_TYPE_REPOSITORY = Symbol("INSTITUTION_ACCOUNT_TYPE_REPOSITORY");

/** Which institutions may be offered for one account type. Two sets, because
 * "doesn't declare it" and "declares nothing at all" are different answers:
 * an institution outside `catalogued` has an unknown catalogue and is shown for
 * every type (a reference catalogue always lags reality). */
export interface InstitutionCatalogue {
  /** Ids that explicitly declare the requested account type. */
  offering: Set<string>;
  /** Ids that declare at least one product — i.e. whose catalogue is known. */
  catalogued: Set<string>;
}

/**
 * Port for the `institution-account-type` join table (which account products an
 * institution offers, flagship first). Pure reference vocabulary: no aggregate,
 * no writes from the API — rows are seeded (`prisma/seed.ts`).
 */
export interface InstitutionAccountTypeRepositoryPort {
  /** Account types per institution id, flagship (`isPrimary`) first. */
  listByInstitutions(institutionIds: string[]): Promise<Map<string, accounts.AccountType[]>>;

  /** The two sets above, for filtering an institution list by product. */
  catalogueFor(type: accounts.AccountType): Promise<InstitutionCatalogue>;
}
