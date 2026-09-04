export const BANK_ACCOUNT_LOOKUP = Symbol("BANK_ACCOUNT_LOOKUP");

/**
 * Minimal read port over the `bank-account` table for domains that only need
 * to verify a body-supplied `bankAccountId`/`paymentAccountId` belongs to the
 * caller before persisting it (Principle II: a body-supplied FK MUST be
 * ownership-verified before being persisted) — `import`, `investment`,
 * `recurring-expense` and `installment-plan` all reference a bank account by
 * id without otherwise needing the full `BankAccountRepositoryPort`.
 */
export interface BankAccountLookupPort {
  accountOwned(userId: string, accountId: string): Promise<boolean>;
}
