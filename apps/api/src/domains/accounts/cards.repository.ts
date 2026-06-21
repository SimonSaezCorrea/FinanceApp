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
    data: Omit<Prisma.CardUncheckedCreateInput, "userId" | "accountId" | "limits">,
    limits: Prisma.CardLimitCreateManyCardInput[],
  ) {
    return this.prisma.card.create({
      data: { ...data, userId, accountId, limits: { create: limits } },
      ...withLimits,
    });
  }

  findOne(userId: string, accountId: string, cardId: string) {
    return this.prisma.card.findFirst({ where: { id: cardId, accountId, userId }, ...withLimits });
  }

  /** Replace card fields + its limits (limits are fully rewritten). */
  async update(
    userId: string,
    accountId: string,
    cardId: string,
    data: Prisma.CardUpdateInput,
    limits: Prisma.CardLimitCreateManyCardInput[] | null,
  ) {
    const existing = await this.prisma.card.findFirst({ where: { id: cardId, accountId, userId } });
    if (!existing) return null;
    return this.prisma.$transaction(async (tx) => {
      if (limits) {
        await tx.cardLimit.deleteMany({ where: { cardId } });
        await tx.cardLimit.createMany({ data: limits.map((l) => ({ ...l, cardId })) });
      }
      await tx.card.update({ where: { id: cardId }, data });
      return tx.card.findFirst({ where: { id: cardId }, ...withLimits });
    });
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<boolean> {
    const result = await this.prisma.card.deleteMany({ where: { id: cardId, accountId, userId } });
    return result.count > 0;
  }
}
