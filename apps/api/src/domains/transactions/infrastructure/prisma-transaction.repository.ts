import { Injectable } from "@nestjs/common";
import { type Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { AccountContext, CardContext, CardLimitContext } from "../domain/movement-policy";
import { Transaction, type TransactionProps } from "../domain/transaction.aggregate";
import type {
  TransactionListFilter,
  TransactionRepositoryPort,
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

/**
 * Adapter (FR-011) — the only file in `transactions` allowed to import
 * `@prisma/client`. `BankAccount.creditUsed`/`CreditStatement` writes here
 * are plain Prisma calls (not the `accounts` domain's own aggregates) —
 * mirrors the precedent `accounts`' own `PayCreditStatementHandler` already
 * set treating the *other* domain's rows as an out-of-aggregate-scope raw
 * write inside the same `prisma.$transaction`, so both domains stay
 * decoupled from each other's tactical DDD internals (FR-020 atomicity is
 * satisfied by wrapping every save below in one transaction, not by sharing
 * aggregates across domains).
 */
@Injectable()
export class PrismaTransactionRepository implements TransactionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, where: TransactionListFilter): Promise<Transaction[]> {
    const prismaWhere: Prisma.TransactionWhereInput = { userId };
    if (where.type) prismaWhere.type = where.type;
    if (where.bankAccountId) prismaWhere.bankAccountId = where.bankAccountId;
    if (where.cardId) prismaWhere.cardId = where.cardId;
    if (where.occurredFrom || where.occurredTo) {
      prismaWhere.occurredAt = {
        ...(where.occurredFrom ? { gte: where.occurredFrom } : {}),
        ...(where.occurredTo ? { lte: where.occurredTo } : {}),
      };
    }
    const rows = await this.prisma.transaction.findMany({ where: prismaWhere, orderBy: { occurredAt: "desc" } });
    return rows.map((r) => Transaction.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<Transaction | null> {
    const row = await this.prisma.transaction.findFirst({ where: { id, userId } });
    return row ? Transaction.fromPersistence(rowToProps(row)) : null;
  }

  findAccount(userId: string, id: string): Promise<AccountContext | null> {
    return this.prisma.bankAccount.findFirst({
      where: { id, userId },
      select: {
        id: true,
        type: true,
        creditLimit: true,
        creditUsed: true,
        billingSettings: { select: { billingCycleDay: true } },
      },
    }).then((row) =>
      row
        ? {
            id: row.id,
            type: row.type,
            creditLimit: row.creditLimit.toString(),
            creditUsed: row.creditUsed.toString(),
            billingCycleDay: row.billingSettings?.billingCycleDay ?? null,
          }
        : null,
    );
  }

  async findCardInAccount(userId: string, cardId: string, accountId: string): Promise<CardContext | null> {
    const card = await this.prisma.cardAccount.findFirst({
      where: { id: cardId, userId, accountId },
      select: { id: true, kind: true },
    });
    return card ?? null;
  }

  async findCardLimit(userId: string, cardId: string, currency: string): Promise<CardLimitContext | null> {
    const limit = await this.prisma.cardLimit.findFirst({ where: { currency, card: { id: cardId, userId } } });
    return limit ? { limitAmount: limit.limitAmount.toString(), usedInitial: limit.usedInitial.toString() } : null;
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
    const find = (t: TransactionType) => grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find(TransactionType.INCOME), expense: find(TransactionType.EXPENSE) };
  }

  async findOrCreateOpenStatement(accountId: string): Promise<{ id: string }> {
    const open = await this.prisma.creditStatement.findFirst({ where: { accountId, closedAt: null }, select: { id: true } });
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

  async isStatementPaid(statementId: string): Promise<boolean> {
    const s = await this.prisma.creditStatement.findUnique({ where: { id: statementId }, select: { paidAt: true } });
    return s?.paidAt != null;
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
        await tx.bankAccount.update({
          where: { id: creditUsedDelta.accountId },
          data: { creditUsed: { increment: creditUsedDelta.delta } },
        });
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
    const owned = await this.prisma.transaction.findFirst({ where: { id, userId }, select: { id: true } });
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
      data.creditStatement = patch.creditStatementId ? { connect: { id: patch.creditStatementId } } : { disconnect: true };
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({ where: { id }, data });
      for (const d of creditUsedDeltas) {
        if (d.delta === "0") continue;
        await tx.bankAccount.update({ where: { id: d.accountId }, data: { creditUsed: { increment: d.delta } } });
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
        await tx.bankAccount.update({
          where: { id: creditUsedDelta.accountId },
          data: { creditUsed: { increment: creditUsedDelta.delta } },
        });
      }
      return result.count > 0;
    });
    return removed;
  }
}
