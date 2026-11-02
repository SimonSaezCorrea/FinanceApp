import { addMoney, subtractMoney } from "@finance/money";

import type { AccountCreditLimitRepositoryPort } from "../../account-credit-limit/domain/ports/account-credit-limit.repository.port";
import type { CreditStatementRepositoryPort } from "../../credit-statement/domain/ports/credit-statement.repository.port";
import type { ForeignCreditContext } from "../domain/movement-policy";
import type { TransactionRepositoryPort } from "../domain/ports/transaction.repository.port";

export interface CreditPoolUsageInput {
  userId: string;
  accountId: string;
  /** The account's credit line currency (never the account's own). */
  currency: string;
  /** A movement being edited, left out of its own usage. */
  excludeTxId?: string;
}

/**
 * What is used of a credit card account's credit in a currency OTHER than its own (spec 039)
 * — the ONE figure the movement rules check a charge against, and the same one the account's
 * DTO shows (`account-dto.mapper.ts`): the line's opening debt, plus every charge of the
 * account in that currency that is still owed (`STILL_OWED`, whichever card made it), minus
 * the payments that settle what is still open, plus the shortfall a short payment carried into
 * the next period (`carriedOverAmount`, a statement figure, not a movement).
 */
export async function creditPoolUsage(
  deps: {
    movements: Pick<TransactionRepositoryPort, "sumsForAccountCurrency">;
    statements: Pick<CreditStatementRepositoryPort, "carriedOverOwed">;
  },
  usedInitial: string,
  input: CreditPoolUsageInput,
): Promise<string> {
  const sums = await deps.movements.sumsForAccountCurrency(
    input.userId,
    input.accountId,
    input.currency,
    input.excludeTxId,
  );
  const carried =
    (await deps.statements.carriedOverOwed([input.accountId])).get(
      `${input.accountId}:${input.currency}`,
    ) ?? "0";
  return addMoney(subtractMoney(addMoney(usedInitial, sums.expense), sums.income), carried);
}

/**
 * The foreign-currency context `MovementPolicy.validate` needs for a movement (spec 039): null
 * when the movement is in the account's own currency or the account isn't a credit card one;
 * otherwise the account's credit in that currency (`pool: null` when it has none) with its use.
 */
export async function foreignCreditContext(
  deps: {
    lines: Pick<AccountCreditLimitRepositoryPort, "findForAccountCurrency">;
    movements: Pick<TransactionRepositoryPort, "sumsForAccountCurrency">;
    statements: Pick<CreditStatementRepositoryPort, "carriedOverOwed">;
  },
  account: { type: string; currency?: string },
  input: CreditPoolUsageInput,
): Promise<ForeignCreditContext | null> {
  if (account.type !== "CREDIT_CARD" || !account.currency || account.currency === input.currency) {
    return null;
  }
  const line = await deps.lines.findForAccountCurrency(
    input.userId,
    input.accountId,
    input.currency,
  );
  if (!line) return { pool: null };
  const used = await creditPoolUsage(deps, line.usedInitial, input);
  return { pool: { limitAmount: line.limitAmount, used } };
}
