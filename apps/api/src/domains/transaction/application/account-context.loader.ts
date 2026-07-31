import type { BankAccountRepositoryPort } from "../../bank-account/domain/ports/bank-account.repository.port";
import type { AccountContext } from "../domain/movement-policy";

/**
 * Loads the slice of a `bank-account` that the movement rules need, through that
 * table's own port — this domain never queries the accounts table itself.
 *
 * `createdAt` comes along because opening the account's very first billing period
 * uses it as the period start, and `credit-statement`'s port takes it as a
 * parameter for exactly the same reason (it must not read this table either).
 */
export async function loadAccountContext(
  accounts: BankAccountRepositoryPort,
  userId: string,
  accountId: string,
): Promise<{ context: AccountContext; createdAt: Date } | null> {
  const account = await accounts.findById(userId, accountId);
  if (!account) return null;
  const snap = account.snapshot();
  return {
    context: {
      id: snap.id,
      type: snap.type,
      creditLimit: account.creditLimit,
      creditUsed: account.creditUsed,
      billingCycleDay: snap.billingCycleDay,
    },
    createdAt: snap.createdAt,
  };
}
