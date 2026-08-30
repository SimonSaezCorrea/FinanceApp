import type { accounts } from "@finance/contracts";
import { moneyToString, subtractMoney, toMoney } from "@finance/money";

import { paymentDueDate } from "../../billing-settings/domain/billing-cycle";
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
    /** The account's configured payment due day, or null. */
    paymentDueDay: number | null;
    /** How `paymentDueDay` is counted (días hábiles or day-of-month). */
    paymentDueCycleType: accounts.BillingCycleType;
  },
): accounts.CreditStatement {
  // A settled period owes nothing, even when the payment didn't cover it all:
  // the shortfall moved to the next period (`carriedToId`) and is owed there.
  const remaining = statement.paidAt
    ? moneyToString("0")
    : subtractMoney(input.amount, statement.paidAmount);
  // Nothing to count from until the period actually closes — an OPEN period
  // has no due date yet, and neither does an account with no due-day configured.
  const dueDate =
    statement.closedAt && input.paymentDueDay != null
      ? paymentDueDate(
          statement.closedAt,
          input.paymentDueDay,
          input.paymentDueCycleType,
        ).toISOString()
      : null;
  return {
    id: statement.id,
    accountId: statement.accountId,
    status: statement.state.name,
    periodStart: statement.periodStart.toISOString(),
    closedAt: statement.closedAt?.toISOString() ?? null,
    paidAt: statement.paidAt?.toISOString() ?? null,
    dueDate,
    amount: moneyToString(input.amount),
    paidAmount: statement.paidAmount,
    carriedOverAmount: statement.carriedOverAmount,
    carriedToId: statement.carriedToId,
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
