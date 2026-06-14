import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class DebtsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.debt.findMany({
      where: { userId },
      orderBy: { openedAt: "desc" },
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.debt.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.DebtUncheckedCreateInput, "userId">) {
    return this.prisma.debt.create({ data: { ...data, userId } });
  }

  async update(userId: string, id: string, data: Prisma.DebtUpdateInput) {
    const result = await this.prisma.debt.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.debt.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
