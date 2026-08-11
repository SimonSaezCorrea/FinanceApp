import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { TransactionSumsRepositoryPort } from "../domain/ports/transaction-sums.repository.port";

/** Adapter for the read/aggregation half of the `transaction` table. */
@Injectable()
export class PrismaTransactionSumsRepository implements TransactionSumsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async sumByTypeForAccount(
    userId: string,
    accountId: string,
  ): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, bankAccountId: accountId },
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find("INCOME"), expense: find("EXPENSE") };
  }

  async windowForAccounts(
    userId: string,
    accountIds: string[],
    since: Date,
  ): Promise<
    { bankAccountId: string | null; type: "INCOME" | "EXPENSE"; amount: string; occurredAt: Date }[]
  > {
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
    const result: { cardId: string; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[] =
      [];
    for (const card of cards) {
      const grouped = await this.prisma.transaction.groupBy({
        by: ["currency", "type"],
        where: {
          userId,
          cardId: card.id,
          ...(card.since ? { occurredAt: { gte: card.since } } : {}),
        },
        _sum: { amount: true },
      });
      for (const g of grouped) {
        result.push({
          cardId: card.id,
          currency: g.currency,
          type: g.type,
          sum: g._sum.amount?.toString() ?? "0",
        });
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
    const find = (t: "INCOME" | "EXPENSE") =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return new Prisma.Decimal(find("EXPENSE")).minus(find("INCOME")).toString();
  }

  async netForPeriod(input: {
    accountId: string;
    cardIds: string[] | null;
    from: Date;
    to: Date;
  }): Promise<string> {
    const window = {
      bankAccountId: input.accountId,
      occurredAt: { gte: input.from, lt: input.to },
    };
    const where =
      input.cardIds === null
        ? window
        : { ...window, type: "EXPENSE" as const, cardId: { in: input.cardIds } };
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return new Prisma.Decimal(find("EXPENSE")).minus(find("INCOME")).toString();
  }

  async breakdownForStatement(
    statementId: string,
  ): Promise<{ purchases: string; installments: string; installmentCount: number }> {
    // Aggregated in Postgres, not by loading the rows: a long period can hold
    // hundreds of movements and only three numbers are wanted.
    const [installments, all] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          creditStatementId: statementId,
          type: "EXPENSE",
          installmentPlanId: { not: null },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.transaction.aggregate({
        where: { creditStatementId: statementId, type: "EXPENSE" },
        _sum: { amount: true },
      }),
    ]);
    const installmentSum = new Prisma.Decimal(installments._sum.amount?.toString() ?? "0");
    const total = new Prisma.Decimal(all._sum.amount?.toString() ?? "0");
    return {
      // Purchases are the remainder, so the two always add up to the period's
      // spend — deriving each with its own query would let them drift apart.
      purchases: total.minus(installmentSum).toString(),
      installments: installmentSum.toString(),
      installmentCount: installments._count._all,
    };
  }
}
