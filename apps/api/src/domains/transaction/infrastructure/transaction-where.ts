import type { Prisma } from "@prisma/client";

import type { TransactionListFilter } from "../domain/ports/transaction.repository.port";
import type { ScopeWhere } from "../domain/scope-where";

/** A custom field's scope as `where` clauses (specs/036). */
export function scopeClauses(scope: ScopeWhere): Prisma.TransactionWhereInput[] {
  const clauses: Prisma.TransactionWhereInput[] = [];
  if (scope.kinds.length > 0) {
    clauses.push({
      OR: scope.kinds.map((kind) =>
        kind === "TRANSFER"
          ? { transferGroupId: { not: null } }
          : { type: kind, transferGroupId: null },
      ),
    });
  }
  if (scope.accountIds !== null) clauses.push({ bankAccountId: { in: scope.accountIds } });
  if (scope.cardIds !== null) clauses.push({ cardId: { in: scope.cardIds } });
  return clauses;
}

/**
 * The ONE `where` builder for a movement filter, shared by the list, its summary and
 * the scope lookups of custom fields — so a page, its totals and a bulk action over
 * "every movement of the filter" can never describe different sets. Extra clauses
 * go under `AND`, leaving `OR` free for the keyset cursor.
 */
export function buildTransactionWhere(
  userId: string,
  where: TransactionListFilter,
): Prisma.TransactionWhereInput {
  const prismaWhere: Prisma.TransactionWhereInput = { userId };
  if (where.type) prismaWhere.type = where.type;
  if (where.bankAccountId) prismaWhere.bankAccountId = where.bankAccountId;
  if (where.cardId) prismaWhere.cardId = where.cardId;
  if (where.creditStatementId) prismaWhere.creditStatementId = where.creditStatementId;
  if (where.recurringExpenseId) prismaWhere.recurringExpenseId = where.recurringExpenseId;
  if (where.categoryId) prismaWhere.categoryId = where.categoryId;
  if (where.occurredFrom || where.occurredTo) {
    prismaWhere.occurredAt = {
      ...(where.occurredFrom ? { gte: where.occurredFrom } : {}),
      ...(where.occurredTo ? { lte: where.occurredTo } : {}),
    };
  }
  const and: Prisma.TransactionWhereInput[] = [];
  if (where.ids) and.push({ id: { in: where.ids } });
  if (where.excludeIds && where.excludeIds.length > 0)
    and.push({ id: { notIn: where.excludeIds } });
  if (where.scope) and.push(...scopeClauses(where.scope));
  if (where.inScope) and.push(...scopeClauses(where.inScope));
  if (and.length > 0) prismaWhere.AND = and;
  return prismaWhere;
}
