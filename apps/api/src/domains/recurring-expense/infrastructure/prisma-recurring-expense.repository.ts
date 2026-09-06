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
    category: row.category,
    frequency: row.frequency,
    interval: row.interval,
    anchorDate: row.anchorDate,
    bankAccountId: row.bankAccountId,
    cardId: row.cardId,
    active: row.active,
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

  async create(userId: string, plan: PlannedRecurringExpense): Promise<RecurringExpense> {
    const data: Prisma.RecurringExpenseUncheckedCreateInput = {
      userId,
      label: plan.label,
      amount: plan.amount,
      currency: plan.currency,
      category: plan.category,
      frequency: plan.frequency,
      interval: plan.interval,
      anchorDate: plan.anchorDate,
      bankAccountId: plan.bankAccountId,
      cardId: plan.cardId,
      active: plan.active,
      notes: plan.notes,
    };
    const row = await this.prisma.recurringExpense.create({ data });
    return RecurringExpense.fromPersistence(rowToProps(row));
  }

  async save(aggregate: RecurringExpense): Promise<void> {
    const snap = aggregate.snapshot();
    const data: Prisma.RecurringExpenseUncheckedUpdateInput = {
      label: snap.label,
      amount: snap.amount,
      currency: snap.currency,
      category: snap.category,
      frequency: snap.frequency,
      interval: snap.interval,
      anchorDate: snap.anchorDate,
      bankAccountId: snap.bankAccountId,
      cardId: snap.cardId,
      active: snap.active,
      notes: snap.notes,
    };
    await this.prisma.recurringExpense.updateMany({
      where: { id: snap.id, userId: snap.userId },
      data,
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.recurringExpense.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
