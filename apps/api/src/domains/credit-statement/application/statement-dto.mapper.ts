import type { accounts } from "@finance/contracts";
import { moneyToString, subtractMoney, toMoney } from "@finance/money";

import type { CreditStatement } from "../domain/credit-statement.aggregate";

/**
 * One place that turns a `CreditStatement` aggregate into its contract shape,
 * shared by the list query and by the pay command's response.
 *
 * The three derived money figures live here rather than in each caller: they must
 * agree with each other (remaining = amount − paid; the minimum is a share of the
 * same amount), and two implementations of "what's still owed" is exactly the kind
 * of drift a money app can't afford.
 */
export function toStatementDto(
  statement: CreditStatement,
  input: {
    /** Live sum for an unsettled period; the frozen figure once settled. */
    amount: string;
    breakdown: { purchases: string; installments: string; installmentCount: number };
    /** The account's configured minimum-payment percentage, or null. */
    minimumPercent: string | null;
  },
): accounts.CreditStatement {
  const remaining = subtractMoney(input.amount, statement.paidAmount);
  return {
    id: statement.id,
    accountId: statement.accountId,
    status: statement.state.name,
    periodStart: statement.periodStart.toISOString(),
    closedAt: statement.closedAt?.toISOString() ?? null,
    paidAt: statement.paidAt?.toISOString() ?? null,
    amount: moneyToString(input.amount),
    paidAmount: statement.paidAmount,
    remainingAmount: toMoney(remaining).isNegative() ? moneyToString("0") : remaining,
    minimumAmount: minimumFor(input.amount, input.minimumPercent),
    breakdown: {
      purchases: moneyToString(input.breakdown.purchases),
      installments: moneyToString(input.breakdown.installments),
      installmentCount: input.breakdown.installmentCount,
    },
    paidFromAccountId: statement.paidFromAccountId,
    paidTransactionId: statement.paidTransactionId,
    createdAt: statement.createdAt.toISOString(),
    updatedAt: statement.updatedAt.toISOString(),
  };
}

/**
 * The minimum this period accepts, as a share of its total. Null when the account
 * defines no percentage — there is no universal minimum-payment rule, so an
 * account without one simply has no minimum, rather than a made-up default.
 */
export function minimumFor(amount: string, percent: string | null): string | null {
  if (percent === null) return null;
  const pct = toMoney(percent);
  if (pct.lessThanOrEqualTo(0)) return null;
  return moneyToString(toMoney(amount).times(pct).dividedBy(100));
}
