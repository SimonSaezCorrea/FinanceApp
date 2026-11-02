import type {
  AccountCreditLimitPlan,
  AccountCreditLimitProps,
} from "../account-credit-limit.entity";

export const ACCOUNT_CREDIT_LIMIT_REPOSITORY = Symbol("ACCOUNT_CREDIT_LIMIT_REPOSITORY");

/**
 * Port for the `account-credit-limit` table only (Adapter, FR-011). A credit line is always
 * addressed through the account that owns it.
 */
export interface AccountCreditLimitRepositoryPort {
  /** Every credit line of these accounts (already scoped by the caller's account read). */
  listByAccounts(
    accountIds: string[],
    tx?: unknown,
  ): Promise<(AccountCreditLimitProps & { accountId: string })[]>;
  /** The account's credit in one currency, if it has one — what a movement in that currency
   * is checked against. Scoped by `userId` through the owning account. */
  findForAccountCurrency(
    userId: string,
    accountId: string,
    currency: string,
    tx?: unknown,
  ): Promise<AccountCreditLimitProps | null>;
  /** Writes these lines for a new account, inside the caller's transaction. */
  createForAccountWithTx(
    tx: unknown,
    accountId: string,
    limits: AccountCreditLimitPlan[],
  ): Promise<void>;
  /** Replaces the account's whole set of lines (edit path), inside the caller's transaction:
   * updates the currencies kept, creates the new ones, deletes the rest. */
  replaceForAccountWithTx(
    tx: unknown,
    accountId: string,
    limits: AccountCreditLimitPlan[],
  ): Promise<void>;
}
