import { addMoney } from "@finance/money";

import type { CreditStatementRepositoryPort } from "../../credit-statement/domain/ports/credit-statement.repository.port";
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
 * What a card still owes against its own limit in `currency` — the ONE figure the movement
 * rules check a new charge against, and the same one the account's DTO shows
 * (`account-dto.mapper.ts`): charges not on a settled period (`openOnly`), minus the payments
 * that settle what is still open.
 *
 * In ANOTHER currency than the account's, a short payment settles its period and carries the
 * rest into the next one as `carriedOverAmount` — not a movement. That debt belongs to the
 * PRIMARY card (the one every settlement lands on), so it is added back there; leaving it out
 * would let the card be charged past its real limit until the next period is paid.
 */
export async function cardLimitUsage(
  deps: {
    movements: Pick<TransactionRepositoryPort, "sumsForCard">;
    statements: Pick<CreditStatementRepositoryPort, "carriedOverOwed">;
  },
  input: CardLimitUsageInput,
): Promise<{ income: string; expense: string }> {
  const usage = await deps.movements.sumsForCard(
    input.userId,
    input.card.id,
    input.currency,
    input.excludeTxId,
    true,
  );
  if (input.currency === input.accountCurrency || !input.card.isPrimary) return usage;
  const carried = (await deps.statements.carriedOverOwed([input.accountId])).get(
    `${input.accountId}:${input.currency}`,
  );
  return carried ? { ...usage, expense: addMoney(usage.expense, carried) } : usage;
}
