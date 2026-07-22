import { Injectable } from "@nestjs/common";
import { type AccountType, type Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { currentCycleStart } from "./billing-cycle";

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
   * One scoped query per account (not a single batched groupBy) since each
   * account can have its own billing cycle window — see `TransactionsRepository
   * .sumsForAccount` (transactions domain) for the identical card-scoping
   * rationale (CREDIT_LINE: everything counts except independently-limited
   * cards; any other account type: only pool-sharing CREDIT-card expense
   * counts, never unrelated debit/cash/income) applied here for display.
   */
  async sumsByAccount(
    userId: string,
    accountsInfo: { id: string; type: AccountType; currency: string; billingCycleDay: number | null }[],
  ): Promise<{ bankAccountId: string | null; type: TransactionType; sum: string }[]> {
    if (accountsInfo.length === 0) return [];
    const now = new Date();
    const result: { bankAccountId: string | null; type: TransactionType; sum: string }[] = [];
    for (const acc of accountsInfo) {
      const cards = await this.prisma.cardAccount.findMany({
        where: { accountId: acc.id, userId },
        select: { id: true, kind: true, limits: { where: { currency: acc.currency }, select: { id: true } } },
      });
      const independentCardIds = cards.filter((c) => c.limits.length > 0).map((c) => c.id);
      const cardFilter: Prisma.TransactionWhereInput =
        acc.type === "CREDIT_LINE"
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
      const since = currentCycleStart(acc.billingCycleDay, now);
      const grouped = await this.prisma.transaction.groupBy({
        by: ["type"],
        where: {
          userId,
          bankAccountId: acc.id,
          currency: acc.currency,
          ...cardFilter,
          ...(since ? { occurredAt: { gte: since } } : {}),
        },
        _sum: { amount: true },
      });
      for (const g of grouped) {
        result.push({ bankAccountId: acc.id, type: g.type, sum: g._sum.amount?.toString() ?? "0" });
      }
    }
    return result;
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
