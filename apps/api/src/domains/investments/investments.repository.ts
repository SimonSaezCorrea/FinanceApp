import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class InvestmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.investment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.investment.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: Omit<Prisma.InvestmentUncheckedCreateInput, "userId">) {
    return this.prisma.investment.create({ data: { ...data, userId } });
  }

  async update(userId: string, id: string, data: Prisma.InvestmentUpdateInput) {
    const result = await this.prisma.investment.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.investment.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
