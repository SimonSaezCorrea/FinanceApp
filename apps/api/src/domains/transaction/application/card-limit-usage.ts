import type { TransactionRepositoryPort } from "../domain/ports/transaction.repository.port";

export interface CardLimitUsageInput {
  userId: string;
  accountId: string;
  /** The credit account's own currency. */
  accountCurrency: string;
  card: { id: string; isPrimary: boolean };
  /** The limit's (and the movement's) currency. */
  currency: string;
  /** A movement being edited, left out of its own usage. */
  excludeTxId?: string;
}

/**
 * What an additional card still owes against its own sub-limit in `currency` — the ONE figure
 * the movement rules check a new charge against, and the same one the account's DTO shows
 * (`account-dto.mapper.ts`): charges not on a settled period (`openOnly`), minus the payments
 * that settle what is still open. A shortfall carried into the next period is the ACCOUNT's
 * debt (spec 039), counted in its credit line (`creditPoolUsage`), never in a sub-limit.
 */
export async function cardLimitUsage(
  deps: { movements: Pick<TransactionRepositoryPort, "sumsForCard"> },
  input: CardLimitUsageInput,
): Promise<{ income: string; expense: string }> {
  return deps.movements.sumsForCard(
    input.userId,
    input.card.id,
    input.currency,
    input.excludeTxId,
    true,
  );
}
