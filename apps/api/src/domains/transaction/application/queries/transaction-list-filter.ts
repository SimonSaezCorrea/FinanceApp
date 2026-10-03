import type { transactions } from "@finance/contracts";

import type { TransactionListFilter } from "../../domain/ports/transaction.repository.port";

/**
 * Contract filters -> the port's pre-parsed filter shape. Shared by the list
 * and summary handlers on purpose: the summary describes the very set the list
 * pages through, so any divergence here would show up as KPIs that don't match
 * the rows on screen.
 *
 * `limit`/`cursor` are deliberately NOT part of this — they select a page, they
 * don't narrow the set being summarized.
 */
/**
 * The ONE definition of "this row is not income nor expense" (FR-017 / SC-004).
 *
 * A transfer is stored as two ordinary rows (an EXPENSE + an INCOME) so that
 * every account sees its own side and the balance arithmetic keeps working —
 * which means no existing sum excludes it by itself. Every income/expense
 * AGGREGATE must apply this predicate; the LIST must not (each account has to
 * see its leg), and neither must the "N movimientos" count, which describes the
 * rows actually on screen.
 */
export const EXCLUDE_TRANSFERS = { transferGroupId: null } as const;

/**
 * Everything that is money moving between the user's own accounts rather than
 * income or spending: transfers (incl. one that pays a credit card), a statement
 * payment or a prepayment (the purchases were already counted as spending when
 * they were made — counting their payment again would count them twice), and a
 * foreign-currency statement's settlement income (spec 028). `internalCategoryIds`
 * are the ids of the STATEMENT_PAYMENT/CARD_PREPAYMENT system categories, the
 * mark those payments carry on their paying account.
 */
export function excludeInternalFlows(internalCategoryIds: string[]) {
  return {
    ...EXCLUDE_TRANSFERS,
    prepaymentStatementId: null,
    settlesStatementId: null,
    OR: [{ categoryId: null }, { categoryId: { notIn: internalCategoryIds } }],
  };
}

export function toListFilter(filters: transactions.TransactionFilters): TransactionListFilter {
  return {
    type: filters.type,
    bankAccountId: filters.bankAccountId,
    cardId: filters.cardId,
    creditStatementId: filters.creditStatementId,
    recurringExpenseId: filters.recurringExpenseId,
    categoryId: filters.categoryId,
    occurredFrom: filters.from ? new Date(filters.from) : undefined,
    occurredTo: filters.to ? new Date(filters.to) : undefined,
  };
}
