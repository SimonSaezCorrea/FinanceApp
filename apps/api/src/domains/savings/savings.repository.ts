import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class SavingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listGoals(userId: string) {
    return this.prisma.savingsGoal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  findGoal(userId: string, id: string) {
    return this.prisma.savingsGoal.findFirst({ where: { id, userId } });
  }

  createGoal(userId: string, data: Omit<Prisma.SavingsGoalUncheckedCreateInput, "userId">) {
    return this.prisma.savingsGoal.create({ data: { ...data, userId } });
  }

  async updateGoal(userId: string, id: string, data: Prisma.SavingsGoalUpdateInput) {
    const result = await this.prisma.savingsGoal.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return this.findGoal(userId, id);
  }

  async removeGoal(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.savingsGoal.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  listEntries(userId: string) {
    return this.prisma.savingsEntry.findMany({
      where: { userId },
      orderBy: { contributedAt: "desc" },
    });
  }

  createEntry(userId: string, data: Omit<Prisma.SavingsEntryUncheckedCreateInput, "userId">) {
    return this.prisma.savingsEntry.create({ data: { ...data, userId } });
  }
}
