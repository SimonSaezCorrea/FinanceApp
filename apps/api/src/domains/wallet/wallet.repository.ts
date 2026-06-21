import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.walletItem.findMany({
      where: { userId },
      orderBy: { order: "asc" },
    });
  }

  count(userId: string) {
    return this.prisma.walletItem.count({ where: { userId } });
  }

  accountOwned(userId: string, accountId: string) {
    return this.prisma.bankAccount.findFirst({ where: { id: accountId, userId } });
  }

  cardOwned(userId: string, cardId: string) {
    return this.prisma.card.findFirst({ where: { id: cardId, userId } });
  }

  existing(userId: string, accountId?: string, cardId?: string) {
    return this.prisma.walletItem.findFirst({
      where: { userId, ...(accountId ? { accountId } : {}), ...(cardId ? { cardId } : {}) },
    });
  }

  create(userId: string, data: { accountId?: string; cardId?: string; order: number }) {
    return this.prisma.walletItem.create({
      data: {
        userId,
        order: data.order,
        accountId: data.accountId ?? null,
        cardId: data.cardId ?? null,
      },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.walletItem.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  /** Persist the given ids' positions by their index. Scoped to the user. */
  reorder(userId: string, ids: string[]): Promise<unknown> {
    return this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.walletItem.updateMany({ where: { id, userId }, data: { order: index } }),
      ),
    );
  }
}
