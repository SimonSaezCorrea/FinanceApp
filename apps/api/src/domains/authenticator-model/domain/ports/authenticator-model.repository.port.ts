import type {
  AuthenticatorCatalog,
  AuthenticatorModelProps,
  CatalogVersion,
} from "../authenticator-model";

export const AUTHENTICATOR_MODEL_REPOSITORY = Symbol("AUTHENTICATOR_MODEL_REPOSITORY");

/** Port for the `authenticator-model` table only (Adapter, Constitution VI). */
export interface AuthenticatorModelRepositoryPort {
  /** The stored catalog's number and next update, or null with an empty table. */
  currentCatalog(): Promise<CatalogVersion | null>;
  /** Replaces every row in one transaction, only when `catalog.number` is greater than the
   * stored one (FIDO: ignore a catalog whose number is not greater). Returns whether it did. */
  replaceAll(catalog: AuthenticatorCatalog): Promise<boolean>;
  findByAaguid(aaguid: string): Promise<AuthenticatorModelProps | null>;
  /** Every model's metadata statement, to load into the WebAuthn library. */
  statements(): Promise<unknown[]>;
  /** AAGUID → compromise status, for every compromised model. */
  compromised(): Promise<Map<string, string>>;
}
