import { Injectable } from "@nestjs/common";
import type { SavingsEntry as SavingsEntryRow, Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  SavingsEntry,
  type PlannedSavingsEntry,
  type SavingsEntryProps,
} from "../domain/savings-entry.aggregate";
import type {
  SavingsEntryRepositoryPort,
  SavingsGoalEntrySums,
} from "../domain/ports/savings-entry.repository.port";

function rowToProps(row: SavingsEntryRow): SavingsEntryProps {
  return {
    id: row.id,
    userId: row.userId,
    savingsGoalId: row.savingsGoalId,
    amount: row.amount.toString(),
    currency: row.currency,
    contributedAt: row.contributedAt,
    title: row.title,
    note: row.note,
    bankAccountId: row.bankAccountId,
    transactionId: row.transactionId,
    createdAt: row.createdAt,
  };
}

/** Adapter (FR-011) — the other file in `savings` allowed to import
 * `@prisma/client`. */
@Injectable()
export class PrismaSavingsEntryRepository implements SavingsEntryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavingsEntry[]> {
    const rows = await this.prisma.savingsEntry.findMany({
      where: { userId },
      orderBy: { contributedAt: "desc" },
    });
    return rows.map((r) => SavingsEntry.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<SavingsEntry | null> {
    const row = await this.prisma.savingsEntry.findFirst({ where: { id, userId } });
    return row ? SavingsEntry.fromPersistence(rowToProps(row)) : null;
  }

  create(userId: string, plan: PlannedSavingsEntry): Promise<SavingsEntry> {
    return this.createWithTx(this.prisma, userId, plan);
  }

  /** Enlisted in the caller's transaction, so the entry and the idempotency
   * record's COMPLETED mark commit together. */
  async createWithTx(
    tx: unknown,
    userId: string,
    plan: PlannedSavingsEntry,
  ): Promise<SavingsEntry> {
    const client = tx as PrismaService;
    const data: Prisma.SavingsEntryUncheckedCreateInput = {
      userId,
      savingsGoalId: plan.savingsGoalId,
      amount: plan.amount,
      currency: plan.currency,
      contributedAt: plan.contributedAt,
      title: plan.title,
      note: plan.note,
      bankAccountId: plan.bankAccountId,
      transactionId: plan.transactionId,
    };
    const row = await client.savingsEntry.create({ data });
    return SavingsEntry.fromPersistence(rowToProps(row));
  }

  save(aggregate: SavingsEntry): Promise<void> {
    return this.saveWithTx(this.prisma, aggregate);
  }

  async saveWithTx(tx: unknown, aggregate: SavingsEntry): Promise<void> {
    const client = tx as PrismaService;
    const snap = aggregate.snapshot();
    const data: Prisma.SavingsEntryUncheckedUpdateInput = {
      savingsGoalId: snap.savingsGoalId,
      amount: snap.amount,
      currency: snap.currency,
      contributedAt: snap.contributedAt,
      title: snap.title,
      note: snap.note,
      bankAccountId: snap.bankAccountId,
      transactionId: snap.transactionId,
    };
    await client.savingsEntry.updateMany({ where: { id: snap.id, userId: snap.userId }, data });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return this.removeWithTx(this.prisma, userId, id);
  }

  async removeWithTx(tx: unknown, userId: string, id: string): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.savingsEntry.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async countByGoal(userId: string, goalId: string): Promise<number> {
    return this.prisma.savingsEntry.count({ where: { userId, savingsGoalId: goalId } });
  }

  async reassignGoalWithTx(
    tx: unknown,
    userId: string,
    fromGoalId: string,
    toGoalId: string | null,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.savingsEntry.updateMany({
      where: { userId, savingsGoalId: fromGoalId },
      data: { savingsGoalId: toGoalId },
    });
  }

  async sumsByGoal(
    userId: string,
    goalIds: string[],
    now: Date,
  ): Promise<Map<string, SavingsGoalEntrySums>> {
    const result = new Map<string, SavingsGoalEntrySums>();
    if (goalIds.length === 0) return result;

    // Last 3 COMPLETE calendar months, excluding the current partial one —
    // e.g. on any day of September, the window is Jun 1 (inclusive) .. Sep 1
    // (exclusive), matching the clarified "últimos 3 meses calendario
    // completos" rule (spec.md §Clarifications).
    const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));

    const [totals, recents] = await Promise.all([
      this.prisma.savingsEntry.groupBy({
        by: ["savingsGoalId"],
        where: { userId, savingsGoalId: { in: goalIds } },
        _sum: { amount: true },
      }),
      this.prisma.savingsEntry.groupBy({
        by: ["savingsGoalId"],
        where: {
          userId,
          savingsGoalId: { in: goalIds },
          contributedAt: { gte: windowStart, lt: windowEnd },
        },
        _sum: { amount: true },
      }),
    ]);

    for (const id of goalIds) result.set(id, { total: "0", lastThreeMonthsTotal: "0" });
    for (const row of totals) {
      if (row.savingsGoalId) {
        result.set(row.savingsGoalId, {
          total: (row._sum.amount ?? 0).toString(),
          lastThreeMonthsTotal: result.get(row.savingsGoalId)?.lastThreeMonthsTotal ?? "0",
        });
      }
    }
    for (const row of recents) {
      if (row.savingsGoalId) {
        const existing = result.get(row.savingsGoalId);
        result.set(row.savingsGoalId, {
          total: existing?.total ?? "0",
          lastThreeMonthsTotal: (row._sum.amount ?? 0).toString(),
        });
      }
    }
    return result;
  }

  async freeSavingsTotal(userId: string): Promise<string> {
    const result = await this.prisma.savingsEntry.aggregate({
      where: { userId, savingsGoalId: null },
      _sum: { amount: true },
    });
    return (result._sum.amount ?? 0).toString();
  }
}
