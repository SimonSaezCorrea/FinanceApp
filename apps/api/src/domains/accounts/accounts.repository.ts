import { Injectable } from "@nestjs/common";
import { type Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

const withCards = {
  include: { cards: { include: { limits: true } }, financialInstitution: true },
} as const;

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

  async institutionName(id: string): Promise<string | null> {
    const inst = await this.prisma.financialInstitution.findUnique({
      where: { id },
      select: { name: true },
    });
    return inst?.name ?? null;
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

  /**
   * Σ amount by (account, type), scoped to user, for derived credit `used`.
   * A credit pool only exists in the account's OWN currency, so transactions
   * in any other currency don't count toward it; and a card that carries its
   * own `CardLimit` for that SAME currency is excluded (its spend is siloed to
   * that card's own limit instead) — a card can still share the pool for its
   * own currency while being independent for another. `accounts` maps each
   * account to its own currency (batched across every row in one query).
   */
  async sumsByAccount(
    userId: string,
    accounts: { id: string; currency: string }[],
  ): Promise<{ bankAccountId: string | null; type: TransactionType; sum: string }[]> {
    if (accounts.length === 0) return [];
    const accountIds = accounts.map((a) => a.id);
    const currencyByAccount = new Map(accounts.map((a) => [a.id, a.currency]));

    const excludedCardIds = (
      await this.prisma.cardLimit.findMany({
        where: { card: { accountId: { in: accountIds }, userId } },
        select: { currency: true, card: { select: { id: true, accountId: true } } },
      })
    )
      .filter((l) => l.currency === currencyByAccount.get(l.card.accountId))
      .map((l) => l.card.id);

    const grouped = await this.prisma.transaction.groupBy({
      by: ["bankAccountId", "currency", "type"],
      where: {
        userId,
        bankAccountId: { in: accountIds },
        ...(excludedCardIds.length > 0 ? { cardId: { notIn: excludedCardIds } } : {}),
      },
      _sum: { amount: true },
    });
    return grouped
      .filter((g) => g.bankAccountId !== null && g.currency === currencyByAccount.get(g.bankAccountId))
      .map((g) => ({
        bankAccountId: g.bankAccountId,
        type: g.type,
        sum: g._sum.amount?.toString() ?? "0",
      }));
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
