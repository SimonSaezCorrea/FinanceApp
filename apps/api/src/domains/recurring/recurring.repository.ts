import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class RecurringRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.recurringExpense.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.recurringExpense.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.RecurringExpenseUncheckedCreateInput, "userId">) {
    return this.prisma.recurringExpense.create({ data: { ...data, userId } });
  }

  async update(userId: string, id: string, data: Prisma.RecurringExpenseUpdateInput) {
    const result = await this.prisma.recurringExpense.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.recurringExpense.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
