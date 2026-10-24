import type { CustomField, PlannedCustomField } from "../custom-field.aggregate";

export const CUSTOM_FIELD_REPOSITORY = Symbol("CUSTOM_FIELD_REPOSITORY");

/** Domain-owned port over the `custom-field` table (specs/036) — zero Prisma imports.
 * Every read is scoped by `userId`: a foreign id resolves to `null`. */
export interface CustomFieldRepositoryPort {
  /** The person's fields, in `sortOrder`. */
  listForUser(userId: string, tx?: unknown): Promise<CustomField[]>;
  findOwned(userId: string, id: string, tx?: unknown): Promise<CustomField | null>;
  countForUser(userId: string): Promise<number>;
  /** `CUSTOM_FIELD_NAME_TAKEN` when the name collides (the unique `nameKey`). */
  createWithTx(tx: unknown, plan: PlannedCustomField): Promise<CustomField>;
  /** Writes the aggregate's whole state. `CUSTOM_FIELD_NAME_TAKEN` on a collision. */
  save(field: CustomField): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
  /** An account is being deleted: it leaves every scope that named it, in the
   * caller's transaction. A scope left with no accounts applies to nothing. */
  removeAccountFromScopesWithTx(tx: unknown, userId: string, accountId: string): Promise<void>;
  /** Every account of the person is being deleted (the template's REPLACE): every
   * scope that named accounts is left naming none. */
  clearAccountScopesWithTx(tx: unknown, userId: string): Promise<void>;
}
