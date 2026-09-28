import { Injectable } from "@nestjs/common";
import type { RecurringExpense as RecurringExpenseRow, Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  RecurringExpense,
  type PlannedRecurringExpense,
  type RecurringExpenseProps,
} from "../domain/recurring-expense.aggregate";
import type { RecurringExpenseRepositoryPort } from "../domain/ports/recurring-expense.repository.port";

function rowToProps(row: RecurringExpenseRow): RecurringExpenseProps {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    amount: row.amount.toString(),
    currency: row.currency,
    categoryId: row.categoryId,
    frequency: row.frequency,
    interval: row.interval,
    anchorDate: row.anchorDate,
    bankAccountId: row.bankAccountId,
    cardId: row.cardId,
    active: row.active,
    endDate: row.endDate,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — the only file in `recurring` allowed to import
 * `@prisma/client`. */
@Injectable()
export class PrismaRecurringExpenseRepository implements RecurringExpenseRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<RecurringExpense[]> {
    const rows = await this.prisma.recurringExpense.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => RecurringExpense.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<RecurringExpense | null> {
    const row = await this.prisma.recurringExpense.findFirst({ where: { id, userId } });
    return row ? RecurringExpense.fromPersistence(rowToProps(row)) : null;
  }

  create(userId: string, plan: PlannedRecurringExpense): Promise<RecurringExpense> {
    return this.createWithTx(this.prisma, userId, plan);
  }

  /** Same insert, enlisted in the caller's transaction (the template import
   * creates many of these atomically with their movements). */
  async createWithTx(
    tx: unknown,
    userId: string,
    plan: PlannedRecurringExpense,
  ): Promise<RecurringExpense> {
    const client = tx as PrismaService;
    const data: Prisma.RecurringExpenseUncheckedCreateInput = {
      userId,
      label: plan.label,
      amount: plan.amount,
      currency: plan.currency,
      categoryId: plan.categoryId,
      frequency: plan.frequency,
      interval: plan.interval,
      anchorDate: plan.anchorDate,
      bankAccountId: plan.bankAccountId,
      cardId: plan.cardId,
      active: plan.active,
      endDate: plan.endDate,
      notes: plan.notes,
    };
    const row = await client.recurringExpense.create({ data });
    return RecurringExpense.fromPersistence(rowToProps(row));
  }

  async save(aggregate: RecurringExpense): Promise<void> {
    const snap = aggregate.snapshot();
    const data: Prisma.RecurringExpenseUncheckedUpdateInput = {
      label: snap.label,
      amount: snap.amount,
      currency: snap.currency,
      categoryId: snap.categoryId,
      frequency: snap.frequency,
      interval: snap.interval,
      anchorDate: snap.anchorDate,
      bankAccountId: snap.bankAccountId,
      cardId: snap.cardId,
      active: snap.active,
      endDate: snap.endDate,
      notes: snap.notes,
    };
    await this.prisma.recurringExpense.updateMany({
      where: { id: snap.id, userId: snap.userId },
      data,
    });
  }

  async listIdsForAccount(userId: string, accountId: string, cardIds: string[]): Promise<string[]> {
    const rows = await this.prisma.recurringExpense.findMany({
      where: {
        userId,
        OR: [
          { bankAccountId: accountId },
          ...(cardIds.length > 0 ? [{ cardId: { in: cardIds } }] : []),
        ],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async removeManyWithTx(tx: unknown, userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const client = tx as PrismaService;
    await client.recurringExpense.deleteMany({ where: { userId, id: { in: ids } } });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.recurringExpense.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
