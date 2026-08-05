import { Inject, Injectable } from "@nestjs/common";
import { type Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../bank-account/domain/ports/bank-account.repository.port";
import { Transaction, type TransactionProps } from "../domain/transaction.aggregate";
import type {
  TransactionListFilter,
  TransactionPage,
  TransactionPageRequest,
  TransactionRepositoryPort,
  TransactionSummaryResult,
} from "../domain/ports/transaction.repository.port";

type Row = NonNullable<Awaited<ReturnType<PrismaService["transaction"]["findFirst"]>>>;

function rowToProps(row: Row): TransactionProps {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    amount: row.amount.toString(),
    currency: row.currency,
    occurredAt: row.occurredAt,
    category: row.category,
    description: row.description,
    observation: row.observation,
    emisor: row.emisor,
    receptor: row.receptor,
    lugar: row.lugar,
    bankAccountId: row.bankAccountId,
    cardId: row.cardId,
    installmentPlanId: row.installmentPlanId,
    creditStatementId: row.creditStatementId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One `{currency, income, expense}` row per currency out of Prisma's
 * `groupBy(currency, type)` shape (which yields up to two rows per currency). */
function foldCurrencyTotals(
  grouped: { currency: string; type: TransactionType; _sum: { amount: unknown } }[],
): { currency: string; income: string; expense: string }[] {
  const byCurrency = new Map<string, { income: string; expense: string }>();
  for (const row of grouped) {
    const entry = byCurrency.get(row.currency) ?? { income: "0", expense: "0" };
    const sum = row._sum.amount?.toString() ?? "0";
    if (row.type === TransactionType.INCOME) entry.income = sum;
    else entry.expense = sum;
    byCurrency.set(row.currency, entry);
  }
  return [...byCurrency.entries()].map(([currency, sums]) => ({ currency, ...sums }));
}

/**
 * Adapter — the ONLY file that touches `prisma.transaction`. A movement's write
 * can also move the account's shared credit pool; that update belongs to the
 * `bank-account` table, so it goes through ITS port
 * (`incrementCreditUsedWithTx`) inside the same `prisma.$transaction` this
 * adapter opens — FR-020 atomicity without either domain reaching into the
 * other's table.
 */
@Injectable()
export class PrismaTransactionRepository implements TransactionRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
  ) {}

  /** Shared `where` builder so a page and its summary can never disagree. */
  private buildWhere(userId: string, where: TransactionListFilter): Prisma.TransactionWhereInput {
    const prismaWhere: Prisma.TransactionWhereInput = { userId };
    if (where.type) prismaWhere.type = where.type;
    if (where.bankAccountId) prismaWhere.bankAccountId = where.bankAccountId;
    if (where.cardId) prismaWhere.cardId = where.cardId;
    if (where.category) {
      prismaWhere.category = { contains: where.category, mode: "insensitive" };
    }
    if (where.occurredFrom || where.occurredTo) {
      prismaWhere.occurredAt = {
        ...(where.occurredFrom ? { gte: where.occurredFrom } : {}),
        ...(where.occurredTo ? { lte: where.occurredTo } : {}),
      };
    }
    return prismaWhere;
  }

  /**
   * Keyset pagination on `(occurredAt desc, id desc)` rather than offset:
   * movements are created and deleted while the user scrolls, and an offset
   * would then skip or repeat rows across pages. `id` breaks ties so the sort
   * is total — two movements on the same date would otherwise have no stable
   * order to resume from.
   */
  async list(
    userId: string,
    where: TransactionListFilter,
    page?: TransactionPageRequest,
  ): Promise<TransactionPage> {
    const prismaWhere = this.buildWhere(userId, where);
    const cursor = page?.cursor;
    if (cursor) {
      prismaWhere.OR = [
        { occurredAt: { lt: cursor.occurredAt } },
        { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
      ];
    }

    const limit = page?.limit;
    const rows = await this.prisma.transaction.findMany({
      where: prismaWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      // One extra row is a cheap "is there another page?" probe — it's dropped
      // below and never reaches the caller.
      ...(limit ? { take: limit + 1 } : {}),
    });

    const hasMore = limit !== undefined && rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((r) => Transaction.fromPersistence(rowToProps(r))),
      nextCursor: hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null,
    };
  }

  async summary(userId: string, where: TransactionListFilter): Promise<TransactionSummaryResult> {
    const prismaWhere = this.buildWhere(userId, where);
    // Aggregated in the database — summing in JS would mean fetching every row,
    // which is the exact cost pagination exists to avoid.
    const [total, grouped, categories] = await Promise.all([
      this.prisma.transaction.count({ where: prismaWhere }),
      this.prisma.transaction.groupBy({
        by: ["currency", "type"],
        where: prismaWhere,
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        where: { ...prismaWhere, category: { not: null } },
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      }),
    ]);

    return {
      total,
      currencyTotals: foldCurrencyTotals(grouped),
      categories: categories.map((c) => c.category).filter((c): c is string => c !== null),
    };
  }

  async findOne(userId: string, id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findFirst({ where: { id, userId } });
    return row ? Transaction.fromPersistence(rowToProps(row)) : null;
  }

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
  async saveNew(
    userId: string,
    plan: Omit<TransactionProps, "id" | "createdAt" | "updatedAt">,
    creditUsedDelta: { accountId: string; delta: string } | null,
  ): Promise<Transaction> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          userId,
          type: plan.type,
          amount: plan.amount,
          currency: plan.currency,
          occurredAt: plan.occurredAt,
          category: plan.category,
          description: plan.description,
          observation: plan.observation,
          emisor: plan.emisor,
          receptor: plan.receptor,
          lugar: plan.lugar,
          bankAccountId: plan.bankAccountId,
          cardId: plan.cardId,
          creditStatementId: plan.creditStatementId,
        },
      });
      if (creditUsedDelta) {
        await this.accounts.incrementCreditUsedWithTx(
          tx,
          creditUsedDelta.accountId,
          creditUsedDelta.delta,
        );
      }
      return created;
    });
    return Transaction.fromPersistence(rowToProps(row));
  }

  async saveUpdate(
    userId: string,
    id: string,
    patch: Partial<Omit<TransactionProps, "id" | "userId" | "createdAt" | "updatedAt">> & {
      bankAccountId?: string | null;
      cardId?: string | null;
      creditStatementId?: string | null;
    },
    creditUsedDeltas: { accountId: string; delta: string }[],
  ): Promise<Transaction | null> {
    const owned = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) return null;

    const data: Prisma.TransactionUpdateInput = {};
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.currency !== undefined) data.currency = patch.currency;
    if (patch.occurredAt !== undefined) data.occurredAt = patch.occurredAt;
    if (patch.category !== undefined) data.category = patch.category;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.observation !== undefined) data.observation = patch.observation;
    if (patch.emisor !== undefined) data.emisor = patch.emisor;
    if (patch.receptor !== undefined) data.receptor = patch.receptor;
    if (patch.lugar !== undefined) data.lugar = patch.lugar;
    if (patch.bankAccountId) {
      data.bankAccount = { connect: { id: patch.bankAccountId } };
    }
    if (patch.cardId !== undefined) {
      data.card = patch.cardId ? { connect: { id: patch.cardId } } : { disconnect: true };
    }
    if (patch.creditStatementId !== undefined) {
      data.creditStatement = patch.creditStatementId
        ? { connect: { id: patch.creditStatementId } }
        : { disconnect: true };
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({ where: { id }, data });
      for (const d of creditUsedDeltas) {
        if (d.delta === "0") continue;
        await this.accounts.incrementCreditUsedWithTx(tx, d.accountId, d.delta);
      }
      return updated;
    });
    return Transaction.fromPersistence(rowToProps(row));
  }

  async removeWithCreditAdjustment(
    userId: string,
    id: string,
    creditUsedDelta: { accountId: string; delta: string } | null,
  ): Promise<boolean> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transaction.deleteMany({ where: { id, userId } });
      if (result.count > 0 && creditUsedDelta && creditUsedDelta.delta !== "0") {
        await this.accounts.incrementCreditUsedWithTx(
          tx,
          creditUsedDelta.accountId,
          creditUsedDelta.delta,
        );
      }
      return result.count > 0;
    });
    return removed;
  }
}
