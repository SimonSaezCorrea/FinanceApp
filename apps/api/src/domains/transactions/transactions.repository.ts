import { Injectable } from "@nestjs/common";
import { type Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Account (type + credit pool) for movement rules + credit enforcement, scoped to the user. */
  findAccount(userId: string, id: string) {
    return this.prisma.bankAccount.findFirst({
      where: { id, userId },
      select: { id: true, type: true, creditLimit: true, creditUsedInitial: true },
    });
  }

  /** Is this card the user's and does it belong to the given account? */
  async cardBelongsToAccount(userId: string, cardId: string, accountId: string): Promise<boolean> {
    const card = await this.prisma.cardAccount.findFirst({
      where: { id: cardId, userId, accountId },
      select: { id: true },
    });
    return card !== null;
  }

  /** Σ income/expense for an account, optionally excluding one tx (for edits). */
  async sumsForAccount(
    userId: string,
    accountId: string,
    excludeTxId?: string,
  ): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        bankAccountId: accountId,
        ...(excludeTxId ? { id: { not: excludeTxId } } : {}),
      },
      _sum: { amount: true },
    });
    const find = (t: TransactionType) =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find(TransactionType.INCOME), expense: find(TransactionType.EXPENSE) };
  }

  list(userId: string, where: Omit<Prisma.TransactionWhereInput, "userId"> = {}) {
    return this.prisma.transaction.findMany({
      where: { ...where, userId },
      orderBy: { occurredAt: "desc" },
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.transaction.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.TransactionUncheckedCreateInput, "userId">) {
    return this.prisma.transaction.create({ data: { ...data, userId } });
  }

  async update(userId: string, id: string, data: Prisma.TransactionUpdateInput) {
    // `updateMany` can't take relational connect/disconnect writes (data.bankAccount,
    // data.card) — only scalar fields. Re-check ownership, then do a single-record
    // `update` by id (which does support them).
    const owned = await this.prisma.transaction.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) return null;
    return this.prisma.transaction.update({ where: { id }, data });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.transaction.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
