import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

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
  ) {
    return this.prisma.cardAccount.create({ data: { ...data, userId, accountId } });
  }

  findOne(userId: string, accountId: string, cardId: string) {
    return this.prisma.cardAccount.findFirst({ where: { id: cardId, accountId, userId } });
  }

  async update(
    userId: string,
    accountId: string,
    cardId: string,
    data: Prisma.CardAccountUncheckedUpdateInput,
  ) {
    const existing = await this.prisma.cardAccount.findFirst({ where: { id: cardId, accountId, userId } });
    if (!existing) return null;
    await this.prisma.cardAccount.update({ where: { id: cardId }, data });
    return this.prisma.cardAccount.findFirst({ where: { id: cardId } });
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<boolean> {
    const result = await this.prisma.cardAccount.deleteMany({ where: { id: cardId, accountId, userId } });
    return result.count > 0;
  }
}
