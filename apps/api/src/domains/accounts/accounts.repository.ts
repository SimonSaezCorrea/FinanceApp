import { Injectable } from "@nestjs/common";
import { type Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

const withCards = { include: { cards: { include: { limits: true } } } } as const;

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, where: Omit<Prisma.BankAccountWhereInput, "userId"> = {}) {
    return this.prisma.bankAccount.findMany({
      where: { ...where, userId },
      orderBy: { createdAt: "desc" },
      ...withCards,
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.bankAccount.findFirst({ where: { id, userId }, ...withCards });
  }

  create(userId: string, data: Omit<Prisma.BankAccountUncheckedCreateInput, "userId">) {
    return this.prisma.bankAccount.create({ data: { ...data, userId }, ...withCards });
  }

  async update(userId: string, id: string, data: Prisma.BankAccountUpdateInput) {
    const result = await this.prisma.bankAccount.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.bankAccount.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  /** Linked transactions since `since`, scoped to user + accounts, for balance series. */
  txWindow(userId: string, accountIds: string[], since: Date) {
    if (accountIds.length === 0) return Promise.resolve([]);
    return this.prisma.transaction.findMany({
      where: { userId, bankAccountId: { in: accountIds }, occurredAt: { gte: since } },
      select: { bankAccountId: true, type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
  }

  /** Sum of linked transaction amounts by type, scoped to user + account. */
  async sumByType(userId: string, accountId: string): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, bankAccountId: accountId },
      _sum: { amount: true },
    });
    const find = (t: TransactionType) =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find(TransactionType.INCOME), expense: find(TransactionType.EXPENSE) };
  }
}
