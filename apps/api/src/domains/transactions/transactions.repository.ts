import { Injectable } from "@nestjs/common";
import { type AccountType, type Prisma, TransactionType } from "@prisma/client";

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
        creditUsedInitial: true,
        billingCycleDay: true,
      },
    });
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
   * Σ income/expense counting toward the account's SHARED credit pool (in the
   * account's OWN currency — the pool doesn't exist in any other currency),
   * optionally scoped to a billing cycle (`since`) and excluding one tx (for
   * edits).
   *
   * For a standalone CREDIT_LINE account, every transaction genuinely belongs
   * to the credit line (an EXPENSE always carries a CREDIT card, an INCOME is
   * a payment) — so everything counts, except transactions on cards that carry
   * their own `CardLimit` ("tope propio") **for that same currency** (a card
   * can share the pool for its own currency while being independent for
   * another, so the exclusion must be per-currency, not per-card).
   *
   * For any OTHER account type that's merely grown a credit card, day-to-day
   * banking (debit-card spend, cash, salary/other income) must NOT count
   * toward the credit pool — only EXPENSE via a pool-sharing CREDIT card does.
   * There's no way today to record "a payment toward this specific add-on
   * card" apart from ordinary account income (income never carries a card),
   * so income is never subtracted for this case.
   */
  async sumsForAccount(
    userId: string,
    accountId: string,
    currency: string,
    accountType: AccountType,
    since: Date | null,
    excludeTxId?: string,
  ): Promise<{ income: string; expense: string }> {
    const cards = await this.prisma.cardAccount.findMany({
      where: { accountId, userId },
      select: { id: true, kind: true, limits: { where: { currency }, select: { id: true } } },
    });
    const independentCardIds = cards.filter((c) => c.limits.length > 0).map((c) => c.id);
    const cardFilter: Prisma.TransactionWhereInput =
      accountType === "CREDIT_LINE"
        ? independentCardIds.length > 0
          ? { cardId: { notIn: independentCardIds } }
          : {}
        : {
            cardId: {
              in: cards
                .filter((c) => c.kind === "CREDIT" && !independentCardIds.includes(c.id))
                .map((c) => c.id),
            },
          };
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        bankAccountId: accountId,
        currency,
        ...cardFilter,
        ...(since ? { occurredAt: { gte: since } } : {}),
        ...(excludeTxId ? { id: { not: excludeTxId } } : {}),
      },
      _sum: { amount: true },
    });
    const find = (t: TransactionType) =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find(TransactionType.INCOME), expense: find(TransactionType.EXPENSE) };
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
