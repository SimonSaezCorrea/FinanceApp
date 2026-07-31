import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  InstallmentPaymentPlan,
  InstallmentPaymentRepositoryPort,
  InstallmentPaymentRow,
} from "../domain/ports/installment-payment.repository.port";

/** Adapter — the ONLY file that touches `prisma.installmentPayment`. */
@Injectable()
export class PrismaInstallmentPaymentRepository implements InstallmentPaymentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByPlans(planIds: string[]): Promise<InstallmentPaymentRow[]> {
    if (planIds.length === 0) return [];
    const rows = await this.prisma.installmentPayment.findMany({
      where: { installmentPlanId: { in: planIds } },
      orderBy: { sequence: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      installmentPlanId: r.installmentPlanId,
      sequence: r.sequence,
      dueDate: r.dueDate,
      amount: r.amount.toString(),
      paidAt: r.paidAt,
    }));
  }

  async createForPlan(planId: string, payments: InstallmentPaymentPlan[]): Promise<void> {
    if (payments.length === 0) return;
    await this.prisma.installmentPayment.createMany({
      data: payments.map((p) => ({ installmentPlanId: planId, ...p })),
    });
  }

  async setPaidAt(userId: string, planId: string, sequence: number, paidAt: Date | null): Promise<boolean> {
    const result = await this.prisma.installmentPayment.updateMany({
      where: { installmentPlanId: planId, sequence, plan: { userId } },
      data: { paidAt },
    });
    return result.count > 0;
  }
}
