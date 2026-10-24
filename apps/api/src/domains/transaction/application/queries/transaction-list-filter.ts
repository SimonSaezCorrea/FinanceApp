import type { transactions } from "@finance/contracts";

import type { CardAccountRepositoryPort } from "../../../card-account/domain/ports/card-account.repository.port";
import type { CustomFieldRepositoryPort } from "../../../custom-field/domain/ports/custom-field.repository.port";
import {
  CustomFieldFilterInvalidError,
  CustomFieldNotFoundError,
} from "../../../custom-field/domain/errors";
import type { TransactionFieldValueRepositoryPort } from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import type { TransactionListFilter } from "../../domain/ports/transaction.repository.port";
import { scopeWhere } from "../../domain/scope-where";

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

/** What resolving a custom field filter needs (specs/036): the field (its type and
 * scope), the ids holding a value, and the person's cards for a card-kind scope. */
export interface CustomFieldFilterDeps {
  fields: CustomFieldRepositoryPort;
  values: TransactionFieldValueRepositoryPort;
  cards: CardAccountRepositoryPort;
}

/** The predicate a custom field filter asks for, or `CUSTOM_FIELD_FILTER_INVALID`. */
async function customFieldClauses(
  deps: CustomFieldFilterDeps,
  userId: string,
  filters: transactions.TransactionFilters,
): Promise<Pick<TransactionListFilter, "ids" | "excludeIds" | "scope">> {
  const field = await deps.fields.findOwned(userId, filters.cf!);
  if (!field) throw new CustomFieldNotFoundError();
  const hasRange = filters.cfMin !== undefined || filters.cfMax !== undefined;
  const predicates = [
    filters.cfv !== undefined,
    filters.cfEmpty === "true",
    filters.cfHasValue === "true",
    filters.cfText !== undefined,
    hasRange,
  ];
  if (predicates.filter(Boolean).length !== 1) throw new CustomFieldFilterInvalidError();

  const parse = (raw: unknown) => {
    try {
      return field.parseValue(raw, "cf");
    } catch {
      throw new CustomFieldFilterInvalidError();
    }
  };

  if (filters.cfv !== undefined) {
    const raw =
      field.type === "BOOLEAN"
        ? filters.cfv === "true"
          ? true
          : filters.cfv === "false"
            ? false
            : null
        : filters.cfv;
    const value = parse(raw);
    return {
      ids: await deps.values.idsMatching(userId, field.id, {
        kind: "equals",
        type: field.type,
        value,
      }),
    };
  }
  if (filters.cfEmpty === "true") {
    // "No value" means within the field's scope: a movement it doesn't apply to has
    // no value either, but it isn't pending anything.
    const [withValue, cards] = await Promise.all([
      deps.values.idsMatching(userId, field.id, { kind: "any" }),
      deps.cards.kindsForUser(userId),
    ]);
    return { excludeIds: withValue, scope: scopeWhere(field.scope, cards) };
  }
  if (filters.cfHasValue === "true") {
    return { ids: await deps.values.idsMatching(userId, field.id, { kind: "any" }) };
  }
  if (filters.cfText !== undefined) {
    if (field.type !== "TEXT") throw new CustomFieldFilterInvalidError();
    return {
      ids: await deps.values.idsMatching(userId, field.id, {
        kind: "contains",
        text: filters.cfText,
      }),
    };
  }
  if (field.type !== "NUMBER" && field.type !== "DATE") throw new CustomFieldFilterInvalidError();
  const min = filters.cfMin !== undefined ? (parse(filters.cfMin) as string) : undefined;
  const max = filters.cfMax !== undefined ? (parse(filters.cfMax) as string) : undefined;
  return {
    ids: await deps.values.idsMatching(userId, field.id, {
      kind: "range",
      type: field.type,
      min,
      max,
    }),
  };
}

/**
 * `toListFilter` plus the custom field filter (specs/036), resolved through the
 * owners' ports into ids and a scope — the list, its summary and every bulk action
 * over "the movements of this filter" go through here.
 */
export async function resolveListFilter(
  deps: CustomFieldFilterDeps,
  userId: string,
  filters: transactions.TransactionFilters,
): Promise<TransactionListFilter> {
  const base = toListFilter(filters);
  if (!filters.cf) return base;
  return { ...base, ...(await customFieldClauses(deps, userId, filters)) };
}
