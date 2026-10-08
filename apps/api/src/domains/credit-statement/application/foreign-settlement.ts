import type { BankAccount } from "../../bank-account/domain/bank-account.aggregate";
import type { TransactionPlan } from "../../transaction/domain/ports/transaction-writer.repository.port";
import { CardLimitNotFoundError, StatementPaymentCurrencyAmbiguousError } from "../domain/errors";

/**
 * Settling a statement that is in ANOTHER currency than its account's (spec 030, absorbing
 * spec 028 US2) is the one place where a payment is two movements instead of one:
 *
 * - an EXPENSE on the source account, in the source's own currency — what actually left it;
 * - an INCOME on the credit account, in the statement's currency, on the card that owns the
 *   limit in that currency — what lowers that limit's usage. It never links to a period and
 *   never counts towards one (`settlesStatementId`).
 *
 * Both are built here, by the ONE function pay and prepay share, so they cannot drift. The
 * credit account's pool in its own currency is not this statement's and never moves.
 */

/** The card the settlement lands on: the account's PRIMARY card, which must hold a limit in
 * `currency`. Never a choice between additional cards — a rule that depended on which plastic
 * happened to be listed first would settle the same payment differently on different days. */
export function settlementCardId(account: BankAccount, currency: string): string {
  const primary = account.primaryCard;
  if (!primary || !primary.limits.some((l) => l.currency === currency)) {
    throw new CardLimitNotFoundError();
  }
  return primary.id;
}

export interface ForeignSettlementInput {
  /** The credit account the statement belongs to. */
  account: BankAccount;
  /** The account the money leaves. */
  fromAccount: BankAccount;
  statementId: string;
  /** The statement's currency (not the account's). */
  currency: string;
  /** What this settles, in the statement's currency. */
  amount: string;
  /** What left the source account, in ITS currency — required when that differs from the
   * statement's; the two amounts are never compared. */
  chargedAmount?: string;
  occurredAt: Date;
  reference?: string;
  /** System category both movements carry (`STATEMENT_PAYMENT` or `CARD_PREPAYMENT`). */
  categoryId: string | null;
  expenseId: string;
  incomeId: string;
  /** A prepago has no `paidTransactionId` pointer on the statement, so its source EXPENSE is
   * marked as part of the settlement itself (read-only, like the INCOME). */
  markExpenseAsSettlement?: boolean;
}

export interface ForeignSettlement {
  expense: TransactionPlan;
  income: TransactionPlan;
  /** What left the source account (== `amount` when both are in the same currency). */
  charged: string;
}

export function planForeignSettlement(input: ForeignSettlementInput): ForeignSettlement {
  const sourceCurrency = input.fromAccount.snapshot().currency;
  let charged = input.amount;
  if (sourceCurrency !== input.currency) {
    if (input.chargedAmount === undefined) throw new StatementPaymentCurrencyAmbiguousError();
    charged = input.chargedAmount;
  }
  const cardId = settlementCardId(input.account, input.currency);

  return {
    charged,
    expense: {
      id: input.expenseId,
      userId: input.account.userId,
      bankAccountId: input.fromAccount.id,
      type: "EXPENSE",
      amount: charged,
      currency: sourceCurrency,
      occurredAt: input.occurredAt,
      categoryId: input.categoryId,
      description: input.account.name,
      observation: input.reference,
      settlesStatementId: input.markExpenseAsSettlement ? input.statementId : null,
    },
    income: {
      id: input.incomeId,
      userId: input.account.userId,
      bankAccountId: input.account.id,
      type: "INCOME",
      amount: input.amount,
      currency: input.currency,
      occurredAt: input.occurredAt,
      categoryId: input.categoryId,
      description: input.fromAccount.name,
      observation: input.reference,
      cardId,
      creditStatementId: null,
      settlesStatementId: input.statementId,
    },
  };
}
