import { Injectable } from "@nestjs/common";
import type { SavingsGoal as SavingsGoalRow, Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  SavingsGoal,
  type PlannedSavingsGoal,
  type SavingsGoalProps,
} from "../domain/savings-goal.aggregate";
import type { SavingsGoalRepositoryPort } from "../domain/ports/savings-goal.repository.port";

function rowToProps(row: SavingsGoalRow): SavingsGoalProps {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    targetAmount: row.targetAmount.toString(),
    currency: row.currency,
    deadline: row.deadline,
    notes: row.notes,
    color: row.color as SavingsGoalProps["color"],
    closedAt: row.closedAt,
    closeDestination: row.closeDestination,
    closeAccountId: row.closeAccountId,
    closeTransactionId: row.closeTransactionId,
    closeAmount: row.closeAmount ? row.closeAmount.toString() : null,
    closeTargetGoalId: row.closeTargetGoalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — one of the two files in `savings` allowed to import
 * `@prisma/client` (the other is `prisma-savings-entry.repository.ts`). */
@Injectable()
export class PrismaSavingsGoalRepository implements SavingsGoalRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavingsGoal[]> {
    const rows = await this.prisma.savingsGoal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => SavingsGoal.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<SavingsGoal | null> {
    const row = await this.prisma.savingsGoal.findFirst({ where: { id, userId } });
    return row ? SavingsGoal.fromPersistence(rowToProps(row)) : null;
  }

  async create(userId: string, plan: PlannedSavingsGoal): Promise<SavingsGoal> {
    const data: Prisma.SavingsGoalUncheckedCreateInput = {
      userId,
      title: plan.title,
      targetAmount: plan.targetAmount,
      currency: plan.currency,
      deadline: plan.deadline,
      notes: plan.notes,
      color: plan.color,
    };
    const row = await this.prisma.savingsGoal.create({ data });
    return SavingsGoal.fromPersistence(rowToProps(row));
  }

  save(aggregate: SavingsGoal): Promise<void> {
    return this.saveWithTx(this.prisma, aggregate);
  }

  /** Enlisted in the caller's transaction, alongside the idempotency record's
   * COMPLETED mark. On its own this makes the WRITE atomic — closing the race
   * requires reading the row inside the same transaction too, via
   * `findOneForUpdateWithTx`. */
  async saveWithTx(tx: unknown, aggregate: SavingsGoal): Promise<void> {
    const client = tx as PrismaService;
    const snap = aggregate.snapshot();
    const data: Prisma.SavingsGoalUncheckedUpdateInput = {
      title: snap.title,
      targetAmount: snap.targetAmount,
      currency: snap.currency,
      deadline: snap.deadline,
      notes: snap.notes,
      color: snap.color,
      closedAt: snap.closedAt,
      closeDestination: snap.closeDestination,
      closeAccountId: snap.closeAccountId,
      closeTransactionId: snap.closeTransactionId,
      closeAmount: snap.closeAmount,
      closeTargetGoalId: snap.closeTargetGoalId,
    };
    await client.savingsGoal.updateMany({ where: { id: snap.id, userId: snap.userId }, data });
  }

  /** `SELECT … FOR UPDATE` inside the caller's transaction — what actually
   * closes the close/reopen race; `saveWithTx` alone only makes the write
   * atomic with the idempotency mark, not the read against a concurrent one. */
  async findOneForUpdateWithTx(
    tx: unknown,
    userId: string,
    id: string,
  ): Promise<SavingsGoal | null> {
    const client = tx as PrismaService;
    const rows = await client.$queryRaw<SavingsGoalRow[]>`
      SELECT * FROM "savings-goal" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE
    `;
    const row = rows[0];
    return row ? SavingsGoal.fromPersistence(rowToProps(row)) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.savingsGoal.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
