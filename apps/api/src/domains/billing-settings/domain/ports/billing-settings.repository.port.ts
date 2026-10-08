import type { BillingSettingsProps } from "../billing-settings.entity";

export const BILLING_SETTINGS_REPOSITORY = Symbol("BILLING_SETTINGS_REPOSITORY");

/** Port for the `billing-settings` table only (Adapter, FR-011). */
export interface BillingSettingsRepositoryPort {
  findByAccount(accountId: string): Promise<BillingSettingsProps | null>;
  listByAccounts(accountIds: string[]): Promise<(BillingSettingsProps & { accountId: string })[]>;
  upsert(accountId: string, settings: Partial<BillingSettingsProps>): Promise<void>;
  /** Same write inside a caller-provided Prisma transaction. */
  upsertWithTx(
    tx: unknown,
    accountId: string,
    settings: Partial<BillingSettingsProps>,
  ): Promise<void>;
}
