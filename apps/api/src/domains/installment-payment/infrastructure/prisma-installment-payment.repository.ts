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
      creditStatementId: r.creditStatementId,
    }));
  }

  async createForPlan(planId: string, payments: InstallmentPaymentPlan[]): Promise<void> {
    if (payments.length === 0) return;
    await this.prisma.installmentPayment.createMany({
      data: payments.map((p) => ({ installmentPlanId: planId, ...p })),
    });
  }

  async listUnbilledDueForPlans(
    planIds: string[],
    dueBy: Date,
    tx?: unknown,
  ): Promise<InstallmentPaymentRow[]> {
    if (planIds.length === 0) return [];
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const rows = await client.installmentPayment.findMany({
      where: {
        installmentPlanId: { in: planIds },
        creditStatementId: null,
        // Paid without ever being billed = settled outside the app (an instalment
        // marked paid in an imported template, specs/027 R7): billing it now would
        // charge the same money twice. On a plan bought in the app `paidAt` is only
        // ever set by settling the period that billed it, so this changes nothing
        // there.
        paidAt: null,
        dueDate: { lte: dueBy },
      },
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
      creditStatementId: r.creditStatementId,
    }));
  }

  async stampWithTx(tx: unknown, paymentIds: string[], statementId: string): Promise<void> {
    if (paymentIds.length === 0) return;
    const client = tx as PrismaService;
    // `creditStatementId: null` in the WHERE, not just the selection upstream: this
    // is what makes the write idempotent even if two callers raced on the same set.
    await client.installmentPayment.updateMany({
      where: { id: { in: paymentIds }, creditStatementId: null },
      data: { creditStatementId: statementId },
    });
  }

  async unstampDueAfterWithTx(tx: unknown, statementId: string, dueAfter: Date): Promise<void> {
    const client = tx as PrismaService;
    await client.installmentPayment.updateMany({
      where: { creditStatementId: statementId, dueDate: { gt: dueAfter }, paidAt: null },
      data: { creditStatementId: null },
    });
  }

  async settleForStatementWithTx(tx: unknown, statementId: string, paidAt: Date): Promise<void> {
    const client = tx as PrismaService;
    // `paidAmount` must become each row's OWN scheduled amount (FR-014): the
    // shortfall, if any, is the PERIOD's carry-over, never doubled onto the
    // instalment. `updateMany` cannot copy one column into another, so this
    // updates each row individually — the set is always small (one period's worth).
    const rows = await client.installmentPayment.findMany({
      where: { creditStatementId: statementId, paidAt: null },
      select: { id: true, amount: true },
    });
    for (const row of rows) {
      await client.installmentPayment.update({
        where: { id: row.id },
        data: { paidAt, paidAmount: row.amount },
      });
    }
  }

  async sumBilledForStatement(
    statementId: string,
    tx?: unknown,
  ): Promise<{ amount: string; count: number }> {
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    const rows = await client.installmentPayment.aggregate({
      where: { creditStatementId: statementId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { amount: rows._sum.amount?.toString() ?? "0", count: rows._count._all };
  }

  async createForPlanWithTx(
    tx: unknown,
    planId: string,
    payments: InstallmentPaymentPlan[],
  ): Promise<InstallmentPaymentRow[]> {
    const client = tx as PrismaService;
    if (payments.length === 0) return [];
    // `createMany` cannot return rows, and the caller needs their ids to build the
    // aggregate without re-reading through a client that can't see this transaction.
    const rows = [];
    for (const p of payments) {
      const row = await client.installmentPayment.create({
        data: { installmentPlanId: planId, ...p },
      });
      rows.push({
        id: row.id,
        installmentPlanId: row.installmentPlanId,
        sequence: row.sequence,
        dueDate: row.dueDate,
        amount: row.amount.toString(),
        paidAt: row.paidAt,
        paidAmount: row.paidAmount?.toString() ?? null,
        carriedOverAmount: row.carriedOverAmount.toString(),
        transactionId: row.transactionId,
        creditStatementId: row.creditStatementId,
      });
    }
    return rows;
  }

  async deleteForPlanWithTx(tx: unknown, planId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.installmentPayment.deleteMany({ where: { installmentPlanId: planId } });
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
