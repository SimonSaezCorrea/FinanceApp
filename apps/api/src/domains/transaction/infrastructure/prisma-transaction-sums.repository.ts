import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { TransactionSumsRepositoryPort } from "../domain/ports/transaction-sums.repository.port";

/** Adapter for the read/aggregation half of the `transaction` table. */
@Injectable()
export class PrismaTransactionSumsRepository implements TransactionSumsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async sumByTypeForAccount(userId: string, accountId: string): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, bankAccountId: accountId },
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") => grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find("INCOME"), expense: find("EXPENSE") };
  }

  async windowForAccounts(
    userId: string,
    accountIds: string[],
    since: Date,
  ): Promise<{ bankAccountId: string | null; type: "INCOME" | "EXPENSE"; amount: string; occurredAt: Date }[]> {
    if (accountIds.length === 0) return [];
    const rows = await this.prisma.transaction.findMany({
      where: { userId, bankAccountId: { in: accountIds }, occurredAt: { gte: since } },
      select: { bankAccountId: true, type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map((r) => ({
      bankAccountId: r.bankAccountId,
      type: r.type,
      amount: r.amount.toString(),
      occurredAt: r.occurredAt,
    }));
  }

  async sumsByCard(
    userId: string,
    cards: { id: string; since: Date | null }[],
  ): Promise<{ cardId: string; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[]> {
    const result: { cardId: string; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[] = [];
    for (const card of cards) {
      const grouped = await this.prisma.transaction.groupBy({
        by: ["currency", "type"],
        where: { userId, cardId: card.id, ...(card.since ? { occurredAt: { gte: card.since } } : {}) },
        _sum: { amount: true },
      });
      for (const g of grouped) {
        result.push({ cardId: card.id, currency: g.currency, type: g.type, sum: g._sum.amount?.toString() ?? "0" });
      }
    }
    return result;
  }

  async netForStatement(statementId: string): Promise<string> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { creditStatementId: statementId },
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") => grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return new Prisma.Decimal(find("EXPENSE")).minus(find("INCOME")).toString();
  }
}
