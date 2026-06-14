import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class InstallmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.installmentPlan.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
      include: { payments: { orderBy: { sequence: "asc" } } },
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.installmentPlan.findFirst({
      where: { id, userId },
      include: { payments: { orderBy: { sequence: "asc" } } },
    });
  }

  createWithPayments(
    userId: string,
    plan: Omit<Prisma.InstallmentPlanUncheckedCreateInput, "userId" | "payments">,
    payments: Prisma.InstallmentPaymentCreateManyPlanInput[],
  ) {
    return this.prisma.installmentPlan.create({
      data: { ...plan, userId, payments: { create: payments } },
      include: { payments: { orderBy: { sequence: "asc" } } },
    });
  }

  /** Marks a payment paid, but only if its plan belongs to the user. */
  async markPaid(userId: string, planId: string, sequence: number): Promise<boolean> {
    const result = await this.prisma.installmentPayment.updateMany({
      where: { installmentPlanId: planId, sequence, plan: { userId } },
      data: { paidAt: new Date() },
    });
    return result.count > 0;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.installmentPlan.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
