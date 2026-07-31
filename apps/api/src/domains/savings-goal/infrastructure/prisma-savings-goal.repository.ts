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
    };
    const row = await this.prisma.savingsGoal.create({ data });
    return SavingsGoal.fromPersistence(rowToProps(row));
  }

  async save(aggregate: SavingsGoal): Promise<void> {
    const snap = aggregate.snapshot();
    const data: Prisma.SavingsGoalUncheckedUpdateInput = {
      title: snap.title,
      targetAmount: snap.targetAmount,
      currency: snap.currency,
      deadline: snap.deadline,
    };
    await this.prisma.savingsGoal.updateMany({ where: { id: snap.id, userId: snap.userId }, data });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.savingsGoal.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
