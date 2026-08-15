import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  INSTALLMENT_PAYMENT_REPOSITORY,
  type InstallmentPaymentRepositoryPort,
} from "../../installment-payment/domain/ports/installment-payment.repository.port";
import {
  InstallmentPlan,
  type InstallmentPaymentProps,
  type InstallmentPlanProps,
} from "../domain/installment-plan.aggregate";
import type {
  CreateInstallmentPlanPlan,
  InstallmentPlanRepositoryPort,
} from "../domain/ports/installment-plan.repository.port";

type Row = NonNullable<Awaited<ReturnType<PrismaService["installmentPlan"]["findFirst"]>>> & {
  payments: {
    id: string;
    sequence: number;
    dueDate: Date;
    amount: { toString(): string };
    paidAt: Date | null;
  }[];
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
    cardId: row.cardId,
    notes: row.notes,
    payments: row.payments.map((p): InstallmentPaymentProps => ({
      id: p.id,
      sequence: p.sequence,
      dueDate: p.dueDate,
      amount: p.amount.toString(),
      paidAt: p.paidAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Adapter — the ONLY file that touches `prisma.installmentPlan`. A plan's
 * schedule lives in the `installment-payment` table, read/written through that
 * domain's own port instead of a Prisma `include`/nested write.
 */
@Injectable()
export class PrismaInstallmentPlanRepository implements InstallmentPlanRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INSTALLMENT_PAYMENT_REPOSITORY)
    private readonly payments: InstallmentPaymentRepositoryPort,
  ) {}

  /** Attaches each plan's schedule, fetched from its own table's adapter. */
  private async hydrate(rows: Omit<Row, "payments">[]): Promise<InstallmentPlan[]> {
    if (rows.length === 0) return [];
    const paymentRows = await this.payments.listByPlans(rows.map((r) => r.id));
    return rows.map((row) =>
      InstallmentPlan.fromPersistence(
        rowToProps({
          ...row,
          payments: paymentRows.filter((p) => p.installmentPlanId === row.id),
        } as Row),
      ),
    );
  }

  async list(userId: string): Promise<InstallmentPlan[]> {
    const rows = await this.prisma.installmentPlan.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    });
    return this.hydrate(rows);
  }

  async findOne(userId: string, id: string): Promise<InstallmentPlan | null> {
    const row = await this.prisma.installmentPlan.findFirst({ where: { id, userId } });
    if (!row) return null;
    const [plan] = await this.hydrate([row]);
    return plan ?? null;
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
        cardId: plan.cardId,
        notes: plan.notes,
      },
    });
    await this.payments.createForPlan(
      row.id,
      plan.payments.map((p) => ({ sequence: p.sequence, dueDate: p.dueDate, amount: p.amount })),
    );
    const created = await this.findOne(userId, row.id);
    if (!created) throw new Error("installment plan disappeared right after being created");
    return created;
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
        cardId: snap.cardId,
        notes: snap.notes,
      },
    });
  }

  /** Sets/clears one payment's `paidAt` — delegated to the payment table's own
   * adapter, kept on this port because the plan aggregate is what decides
   * whether that sequence may change state. */
  setPaymentPaidAt(
    userId: string,
    planId: string,
    sequence: number,
    paidAt: Date | null,
  ): Promise<boolean> {
    return this.payments.setPaidAt(userId, planId, sequence, paidAt);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.installmentPlan.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
