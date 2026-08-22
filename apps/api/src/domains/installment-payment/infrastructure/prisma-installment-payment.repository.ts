import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { InstallmentPaymentLookupPort } from "../domain/ports/installment-payment-lookup.port";
import type {
  InstallmentPaymentPlan,
  InstallmentPaymentRepositoryPort,
  InstallmentPaymentRow,
} from "../domain/ports/installment-payment.repository.port";

/** Adapter — the ONLY file that touches `prisma.installmentPayment`. */
@Injectable()
export class PrismaInstallmentPaymentRepository
  implements InstallmentPaymentRepositoryPort, InstallmentPaymentLookupPort
{
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
      paidAmount: r.paidAmount?.toString() ?? null,
      carriedOverAmount: r.carriedOverAmount.toString(),
      transactionId: r.transactionId,
    }));
  }

  async createForPlan(planId: string, payments: InstallmentPaymentPlan[]): Promise<void> {
    if (payments.length === 0) return;
    await this.prisma.installmentPayment.createMany({
      data: payments.map((p) => ({ installmentPlanId: planId, ...p })),
    });
  }

  async setPaidAt(
    userId: string,
    planId: string,
    sequence: number,
    paidAt: Date | null,
  ): Promise<boolean> {
    const result = await this.prisma.installmentPayment.updateMany({
      where: { installmentPlanId: planId, sequence, plan: { userId } },
      data: { paidAt },
    });
    return result.count > 0;
  }

  async savePaymentStateWithTx(
    tx: unknown,
    planId: string,
    sequence: number,
    state: { paidAt: Date | null; paidAmount: string | null; transactionId: string | null },
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.installmentPayment.updateMany({
      where: { installmentPlanId: planId, sequence },
      data: state,
    });
  }

  async applyCarryDeltasWithTx(
    tx: unknown,
    planId: string,
    deltas: { sequence: number; delta: string }[],
  ): Promise<void> {
    const client = tx as PrismaService;
    for (const { sequence, delta } of deltas) {
      // `increment` rather than a computed write: the delta is what the payment
      // moved, and adding it is what makes two carries onto the same instalment
      // accumulate instead of overwriting each other.
      await client.installmentPayment.updateMany({
        where: { installmentPlanId: planId, sequence },
        data: { carriedOverAmount: { increment: delta } },
      });
    }
  }

  async isLinkedToPayment(userId: string, transactionId: string): Promise<boolean> {
    const row = await this.prisma.installmentPayment.findFirst({
      where: { transactionId, plan: { userId } },
      select: { id: true },
    });
    return row !== null;
  }
}
