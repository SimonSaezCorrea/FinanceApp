import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  InstallmentPlan,
  type InstallmentPaymentProps,
  type InstallmentPlanProps,
} from "../domain/installment-plan.aggregate";
import type {
  CreateInstallmentPlanPlan,
  InstallmentPlanRepositoryPort,
} from "../domain/ports/installment-plan.repository.port";

const withPayments = {
  include: { payments: { orderBy: { sequence: "asc" as const } } },
} as const;

type Row = NonNullable<Awaited<ReturnType<PrismaService["installmentPlan"]["findFirst"]>>> & {
  payments: { id: string; sequence: number; dueDate: Date; amount: { toString(): string }; paidAt: Date | null }[];
};

function rowToProps(row: Row): InstallmentPlanProps {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    totalPrincipal: row.totalPrincipal.toString(),
    installmentCount: row.installmentCount,
    startDate: row.startDate,
    currency: row.currency,
    frequency: row.frequency,
    frequencyInterval: row.frequencyInterval,
    notes: row.notes,
    payments: row.payments.map(
      (p): InstallmentPaymentProps => ({
        id: p.id,
        sequence: p.sequence,
        dueDate: p.dueDate,
        amount: p.amount.toString(),
        paidAt: p.paidAt,
      }),
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — the only file in `installments` allowed to import
 * `@prisma/client`. */
@Injectable()
export class PrismaInstallmentPlanRepository implements InstallmentPlanRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<InstallmentPlan[]> {
    const rows = await this.prisma.installmentPlan.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
      ...withPayments,
    });
    return rows.map((r) => InstallmentPlan.fromPersistence(rowToProps(r as Row)));
  }

  async findOne(userId: string, id: string): Promise<InstallmentPlan | null> {
    const row = await this.prisma.installmentPlan.findFirst({ where: { id, userId }, ...withPayments });
    return row ? InstallmentPlan.fromPersistence(rowToProps(row as Row)) : null;
  }

  async create(userId: string, plan: CreateInstallmentPlanPlan): Promise<InstallmentPlan> {
    const row = await this.prisma.installmentPlan.create({
      data: {
        userId,
        title: plan.title,
        totalPrincipal: plan.totalPrincipal,
        installmentCount: plan.installmentCount,
        startDate: plan.startDate,
        currency: plan.currency,
        frequency: plan.frequency,
        frequencyInterval: plan.frequencyInterval,
        notes: plan.notes,
        payments: {
          create: plan.payments.map((p) => ({ sequence: p.sequence, dueDate: p.dueDate, amount: p.amount })),
        },
      },
      ...withPayments,
    });
    return InstallmentPlan.fromPersistence(rowToProps(row as Row));
  }

  async save(aggregate: InstallmentPlan): Promise<void> {
    const snap = aggregate.snapshot();
    await this.prisma.installmentPlan.update({
      where: { id: snap.id },
      data: {
        title: snap.title,
        currency: snap.currency,
        frequency: snap.frequency,
        frequencyInterval: snap.frequencyInterval,
        notes: snap.notes,
      },
    });
  }

  /** Sets/clears one payment's `paidAt`, scoped to the plan belonging to
   * `userId` (mirrors the pre-migration `markPaid`/`markUnpaid`). */
  async setPaymentPaidAt(userId: string, planId: string, sequence: number, paidAt: Date | null): Promise<boolean> {
    const result = await this.prisma.installmentPayment.updateMany({
      where: { installmentPlanId: planId, sequence, plan: { userId } },
      data: { paidAt },
    });
    return result.count > 0;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.installmentPlan.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
