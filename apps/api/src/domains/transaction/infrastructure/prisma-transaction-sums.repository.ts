import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { TransactionSumsRepositoryPort } from "../domain/ports/transaction-sums.repository.port";

/**
 * Spec 014, FR-007. A plan's purchase movement carries `installmentPlanId`, sits on
 * the credit account, and gets linked to whatever period was open when it was created
 * — so without this it would bill the WHOLE purchase (1.080.000) in a single month
 * instead of one instalment (90.000) per period, which is the defect the feature
 * exists to remove.
 *
 * What that movement is for is the CREDIT POOL: the issuer reserves the full amount on
 * purchase day. What a period charges is the plan's SCHEDULE, added as a summand of
 * its own (`CreditStatement.totalFor`) rather than as movements — the same choice
 * already made for `carriedOverAmount`, and for the same reason: a synthetic movement
 * would be erased by "Sincronizar pagos", which recomputes from real ones.
 *
 * The issuer's interest charge deliberately does NOT carry an `installmentPlanId`, so
 * it keeps counting here as the ordinary period charge it is.
 */
const EXCLUDE_PLAN_PURCHASES = { installmentPlanId: null } as const;

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
          // A card's own tally must mean "still owed", same as the persisted pool
          // (`creditUsed`) it's a breakdown of. Once a statement is PAID, its debt
          // already left the pool — leaving these rows in would count it forever,
          // which is what made a card's usage bar drift past the account's own.
          OR: [{ creditStatementId: null }, { creditStatement: { paidAt: null } }],
          // The plan's purchase reserves the pool once, on day one (spec 014); what
          // gets paid off after that is tracked per-instalment/period, never against
          // this one row — summing it here would double it against that tracking
          // (or, once instalments start paying down, understate what's released).
          ...EXCLUDE_PLAN_PURCHASES,
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
      where: { creditStatementId: statementId, ...EXCLUDE_PLAN_PURCHASES },
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
        ? { ...window, ...EXCLUDE_PLAN_PURCHASES }
        : {
            ...window,
            ...EXCLUDE_PLAN_PURCHASES,
            type: "EXPENSE" as const,
            cardId: { in: input.cardIds },
          };
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return new Prisma.Decimal(find("EXPENSE")).minus(find("INCOME")).toString();
  }
}
