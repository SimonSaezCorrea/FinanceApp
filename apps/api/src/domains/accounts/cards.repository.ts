import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

const withLimits = { include: { limits: true } } as const;

/** Cards are scoped via their owner (userId) + parent account. */
@Injectable()
export class CardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  accountExists(userId: string, accountId: string) {
    return this.prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
  }

  create(
    userId: string,
    accountId: string,
    data: Omit<Prisma.CardAccountUncheckedCreateInput, "userId" | "accountId">,
    limits: { currency: string; limitAmount: string; usedInitial: string }[],
  ) {
    return this.prisma.cardAccount.create({
      data: {
        ...data,
        userId,
        accountId,
        ...(limits.length > 0 ? { limits: { create: limits } } : {}),
      },
      ...withLimits,
    });
  }

  findOne(userId: string, accountId: string, cardId: string) {
    return this.prisma.cardAccount.findFirst({
      where: { id: cardId, accountId, userId },
      ...withLimits,
    });
  }

  async update(
    userId: string,
    accountId: string,
    cardId: string,
    data: Prisma.CardAccountUncheckedUpdateInput,
    limits: { currency: string; limitAmount: string; usedInitial: string }[],
  ) {
    const existing = await this.prisma.cardAccount.findFirst({
      where: { id: cardId, accountId, userId },
    });
    if (!existing) return null;
    // Sub-limits are replaced wholesale each edit (same "full replace" convention
    // as the rest of the card's fields) — clear + recreate in one atomic write.
    await this.prisma.cardAccount.update({
      where: { id: cardId },
      data: {
        ...data,
        limits: {
          deleteMany: {},
          create: limits,
        },
      },
    });
    return this.prisma.cardAccount.findFirst({ where: { id: cardId }, ...withLimits });
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<boolean> {
    const result = await this.prisma.cardAccount.deleteMany({
      where: { id: cardId, accountId, userId },
    });
    return result.count > 0;
  }

  /** The account's current primary CREDIT card, if any (optionally excluding one card — for edits). */
  findPrimaryCreditCard(userId: string, accountId: string, excludeCardId?: string) {
    return this.prisma.cardAccount.findFirst({
      where: {
        accountId,
        userId,
        kind: "CREDIT",
        isPrimary: true,
        ...(excludeCardId ? { id: { not: excludeCardId } } : {}),
      },
      select: { id: true },
    });
  }

  /** The card's own sub-limit for a given currency, if one was set. */
  findCardLimit(userId: string, cardId: string, currency: string) {
    return this.prisma.cardLimit.findFirst({
      where: { currency, card: { id: cardId, userId } },
    });
  }

  /** Σ amount by (card, currency, type), scoped to user. For derived per-card-limit `used`. */
  async sumsByCard(
    userId: string,
    cardIds: string[],
  ): Promise<{ cardId: string | null; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[]> {
    if (cardIds.length === 0) return [];
    const grouped = await this.prisma.transaction.groupBy({
      by: ["cardId", "currency", "type"],
      where: { userId, cardId: { in: cardIds } },
      _sum: { amount: true },
    });
    return grouped.map((g) => ({
      cardId: g.cardId,
      currency: g.currency,
      type: g.type,
      sum: g._sum.amount?.toString() ?? "0",
    }));
  }
}
