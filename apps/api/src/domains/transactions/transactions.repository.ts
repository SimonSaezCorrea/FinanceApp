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
      select: {
        id: true,
        type: true,
        currency: true,
        creditLimit: true,
        creditUsed: true,
        createdAt: true,
        billingSettings: { select: { billingCycleDay: true } },
      },
    });
  }

  /** Atomically adjust the account's persisted credit-pool `creditUsed` by a signed amount. */
  adjustCreditUsed(accountId: string, delta: string) {
    return this.prisma.bankAccount.update({
      where: { id: accountId },
      data: { creditUsed: { increment: delta } },
    });
  }

  /**
   * The account's currently OPEN billing period (`closedAt: null`), or creates one if
   * none exists — seeded from the previous statement's `closedAt`, or the account's
   * `createdAt` for the very first period. Transactions that contribute to the pool
   * link to whichever statement this returns at the moment they're created.
   */
  async findOrCreateOpenStatement(accountId: string): Promise<{ id: string }> {
    const open = await this.prisma.creditStatement.findFirst({
      where: { accountId, closedAt: null },
      select: { id: true },
    });
    if (open) return open;
    const [last, account] = await Promise.all([
      this.prisma.creditStatement.findFirst({
        where: { accountId },
        orderBy: { createdAt: "desc" },
        select: { closedAt: true },
      }),
      this.prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId }, select: { createdAt: true } }),
    ]);
    return this.prisma.creditStatement.create({
      data: { accountId, periodStart: last?.closedAt ?? account.createdAt },
      select: { id: true },
    });
  }

  /** Whether a given statement is already paid — governs the "don't touch creditUsed
   * for transactions linked to an already-settled statement" edit/delete rule. */
  async isStatementPaid(statementId: string): Promise<boolean> {
    const s = await this.prisma.creditStatement.findUnique({
      where: { id: statementId },
      select: { paidAt: true },
    });
    return s?.paidAt != null;
  }

  /** The card (with `kind`, for credit-pool checks) if it's the user's and belongs to this account. */
  findCardInAccount(userId: string, cardId: string, accountId: string) {
    return this.prisma.cardAccount.findFirst({
      where: { id: cardId, userId, accountId },
      select: { id: true, kind: true },
    });
  }

  /** The card's own sub-limit for a given currency, if one was set. */
  findCardLimit(userId: string, cardId: string, currency: string) {
    return this.prisma.cardLimit.findFirst({
      where: { currency, card: { id: cardId, userId } },
    });
  }

  /**
   * Σ income/expense for one card in one currency, optionally scoped to a
   * billing cycle (`since`) and excluding one tx (for edits).
   */
  async sumsForCard(
    userId: string,
    cardId: string,
    currency: string,
    since: Date | null,
    excludeTxId?: string,
  ): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        cardId,
        currency,
        ...(since ? { occurredAt: { gte: since } } : {}),
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
