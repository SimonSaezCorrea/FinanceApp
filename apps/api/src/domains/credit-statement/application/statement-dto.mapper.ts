import { accounts as accountsRules, type accounts } from "@finance/contracts";
import { moneyToString, subtractMoney, toMoney } from "@finance/money";

import { nextBoundaryAfter, paymentDueDate } from "../../billing-settings/domain/billing-cycle";
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
    /** The account's configured billing (generation) cycle day, or null. */
    billingCycleDay: number | null;
    /** How `billingCycleDay` is counted (días hábiles or day-of-month). */
    billingCycleType: accounts.BillingCycleType;
    /** Spec 028: the account's own currency — decides whether the period is a
     * foreign-currency one, and so whether it can be transferred. */
    accountCurrency: string;
    /** "Now" for the transfer rule's due-date check; defaults to the real now. */
    today?: Date;
  },
): accounts.CreditStatement {
  // A settled period owes nothing, even when the payment didn't cover it all:
  // the shortfall moved to the next period (`carriedToId`) and is owed there. A
  // transferred one owes nothing here either — its debt became a charge elsewhere.
  const remaining =
    statement.paidAt || statement.transferredAt
      ? moneyToString("0")
      : subtractMoney(input.amount, statement.paidAmount);
  // The date typed at "Generar facturación" wins. Only a period closed before
  // that existed falls back to deriving it from the (legacy) configured due day —
  // an OPEN period has no due date yet, and neither does an unconfigured account.
  const dueDate = statement.dueDate
    ? statement.dueDate.toISOString()
    : statement.closedAt && input.paymentDueDay != null
      ? paymentDueDate(
          statement.closedAt,
          input.paymentDueDay,
          input.paymentDueCycleType,
        ).toISOString()
      : null;
  // Only meaningful while OPEN — a closed period already has its real `closedAt`,
  // and without a configured day there's nothing to project a boundary from.
  const nextClosingDate = statement.closedAt
    ? null
    : statement.plannedCloseAt
      ? statement.plannedCloseAt.toISOString()
      : input.billingCycleDay != null
        ? nextBoundaryAfter(
            statement.periodStart,
            input.billingCycleDay,
            input.billingCycleType,
          ).toISOString()
        : null;
  const remainingAmount = toMoney(remaining).isNegative() ? moneyToString("0") : remaining;
  const closedAt = statement.closedAt?.toISOString() ?? null;
  const paidAt = statement.paidAt?.toISOString() ?? null;
  const transferredAt = statement.transferredAt?.toISOString() ?? null;
  return {
    id: statement.id,
    accountId: statement.accountId,
    status: statement.state.name,
    currency: statement.currency,
    transferredAt,
    transferredAmount: statement.transferredAmount,
    transferredToId: statement.transferredToId,
    // The SAME rule the API enforces on the transfer endpoint.
    canTransfer: accountsRules.canTransferStatement(
      {
        currency: statement.currency,
        closedAt,
        paidAt,
        transferredAt,
        remainingAmount,
        dueDate,
      },
      input.accountCurrency,
      input.today ?? new Date(),
    ),
    transferReversal: null,
    periodStart: statement.periodStart.toISOString(),
    closedAt,
    paidAt,
    dueDate,
    nextClosingDate,
    amount: moneyToString(input.amount),
    paidAmount: statement.paidAmount,
    carriedOverAmount: statement.carriedOverAmount,
    prepaidAmount: statement.prepaidAmount,
    carriedToId: statement.carriedToId,
    remainingAmount,
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
