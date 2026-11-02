import type { BankAccount } from "../../bank-account/domain/bank-account.aggregate";
import type { TransactionPlan } from "../../transaction/domain/ports/transaction-writer.repository.port";
import {
  CreditPoolCurrencyNotFoundError,
  StatementPaymentCurrencyAmbiguousError,
} from "../domain/errors";

/**
 * Settling a statement that is in ANOTHER currency than its account's (spec 030, absorbing
 * spec 028 US2) is the one place where a payment is two movements instead of one:
 *
 * - an EXPENSE on the source account, in the source's own currency — what actually left it;
 * - an INCOME on the credit account, in the statement's currency, with no card — what lowers
 *   the account's credit in that currency (spec 039: the credit is the account's, every card
 *   spends from it). It never links to a period and never counts towards one
 *   (`settlesStatementId`).
 *
 * Both are built here, by the ONE function pay and prepay share, so they cannot drift. The
 * credit account's pool in its own currency is not this statement's and never moves.
 */

/** A settlement in another currency lowers the account's credit there, so the account must
 * have credit in that currency (spec 039). */
export function assertSettlementCredit(account: BankAccount, currency: string): void {
  if (account.creditLineIn(currency) === null) throw new CreditPoolCurrencyNotFoundError();
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
  assertSettlementCredit(input.account, input.currency);

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
      // Names the CREDIT account the settlement belongs to, so a link from this movement
      // lands on the right billing tab (the movement itself sits on the source account).
      prepaymentAccountId: input.markExpenseAsSettlement ? input.account.id : null,
      // A prepago's two legs are undone together (deleting either from Movimientos).
      settlementPairId: input.markExpenseAsSettlement ? input.expenseId : null,
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
      cardId: null,
      creditStatementId: null,
      settlesStatementId: input.statementId,
      settlementPairId: input.markExpenseAsSettlement ? input.expenseId : null,
    },
  };
}
