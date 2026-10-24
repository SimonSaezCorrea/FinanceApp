import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  MovementFacts,
  TransactionScopeLookupPort,
} from "../domain/ports/transaction-scope-lookup.port";
import type { TransactionListFilter } from "../domain/ports/transaction.repository.port";
import type { ScopeWhere } from "../domain/scope-where";
import { buildTransactionWhere } from "./transaction-where";

const NEWEST_FIRST = [{ occurredAt: "desc" as const }, { id: "desc" as const }];

/** Adapter for `TransactionScopeLookupPort` (specs/036) — reads `prisma.transaction`
 * with the same `where` builder as the list, so "every movement of this filter"
 * means exactly what the list shows. */
@Injectable()
export class PrismaTransactionScopeLookupRepository implements TransactionScopeLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  countInScope(userId: string, scope: ScopeWhere): Promise<number> {
    return this.prisma.transaction.count({ where: buildTransactionWhere(userId, { scope }) });
  }

  async idsInScope(userId: string, scope: ScopeWhere, limit: number): Promise<string[]> {
    const rows = await this.prisma.transaction.findMany({
      where: buildTransactionWhere(userId, { scope }),
      orderBy: NEWEST_FIRST,
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async idsForFilter(
    userId: string,
    filter: TransactionListFilter,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.prisma.transaction.findMany({
      where: buildTransactionWhere(userId, filter),
      orderBy: NEWEST_FIRST,
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async factsFor(userId: string, ids: string[], tx?: unknown): Promise<MovementFacts[]> {
    if (ids.length === 0) return [];
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const rows = await client.transaction.findMany({
      where: { userId, id: { in: ids } },
      select: {
        id: true,
        type: true,
        transferGroupId: true,
        bankAccountId: true,
        cardId: true,
        currency: true,
        amount: true,
      },
    });
    return rows.map((r) => ({ ...r, amount: r.amount.toString() }));
  }
}
