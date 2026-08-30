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
import type { BillableCandidate } from "../domain/installment-billing";
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
    paidAmount: string | null;
    carriedOverAmount: string;
    transactionId: string | null;
    creditStatementId: string | null;
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
    category: row.category,
    paymentAccountId: row.paymentAccountId,
    notes: row.notes,
    payments: row.payments.map((p): InstallmentPaymentProps => ({
      id: p.id,
      sequence: p.sequence,
      dueDate: p.dueDate,
      amount: p.amount.toString(),
      paidAt: p.paidAt,
      paidAmount: p.paidAmount,
      carriedOverAmount: p.carriedOverAmount,
      transactionId: p.transactionId,
      creditStatementId: p.creditStatementId,
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

  create(userId: string, plan: CreateInstallmentPlanPlan): Promise<InstallmentPlan> {
    return this.createWithTx(this.prisma, userId, plan);
  }

  async createWithTx(
    tx: unknown,
    userId: string,
    plan: CreateInstallmentPlanPlan,
  ): Promise<InstallmentPlan> {
    const client = tx as PrismaService;
    const row = await client.installmentPlan.create({
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
        category: plan.category,
        paymentAccountId: plan.paymentAccountId,
        notes: plan.notes,
      },
    });
    const payments = await this.payments.createForPlanWithTx(
      tx,
      row.id,
      plan.payments.map((p) => ({ sequence: p.sequence, dueDate: p.dueDate, amount: p.amount })),
    );
    // Built from what was just written rather than re-read: inside an open
    // transaction, a read through another client would not see these rows.
    return InstallmentPlan.fromPersistence({
      ...rowToProps({ ...row, payments: [] }),
      payments: payments.map((p) => ({
        id: p.id,
        sequence: p.sequence,
        dueDate: p.dueDate,
        amount: p.amount,
        paidAt: p.paidAt,
        paidAmount: p.paidAmount,
        carriedOverAmount: p.carriedOverAmount,
        transactionId: p.transactionId,
        creditStatementId: p.creditStatementId,
      })),
    });
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
        category: snap.category,
        paymentAccountId: snap.paymentAccountId,
        notes: snap.notes,
      },
    });
  }

  async savePaymentWithTx(
    tx: unknown,
    aggregate: InstallmentPlan,
    sequence: number,
    carryDeltas: { sequence: number; delta: string }[],
  ): Promise<void> {
    const snap = aggregate.snapshot();
    const payment = snap.payments.find((p) => p.sequence === sequence);
    if (!payment) throw new Error(`installment ${sequence} missing from plan ${snap.id}`);
    await this.payments.savePaymentStateWithTx(tx, snap.id, sequence, {
      paidAt: payment.paidAt,
      paidAmount: payment.paidAmount,
      transactionId: payment.transactionId,
    });
    await this.payments.applyCarryDeltasWithTx(tx, snap.id, carryDeltas);
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

  async listBillableForCards(cardIds: string[], dueBy: Date): Promise<BillableCandidate[]> {
    if (cardIds.length === 0) return [];
    const plans = await this.prisma.installmentPlan.findMany({
      where: { cardId: { in: cardIds } },
      select: { id: true, currency: true },
    });
    if (plans.length === 0) return [];
    const currencyByPlan = new Map(plans.map((p) => [p.id, p.currency]));
    const rows = await this.payments.listUnbilledDueForPlans(
      plans.map((p) => p.id),
      dueBy,
    );
    return rows.map((row) => ({
      planId: row.installmentPlanId,
      paymentId: row.id,
      sequence: row.sequence,
      dueDate: row.dueDate,
      amount: row.amount,
      currency: currencyByPlan.get(row.installmentPlanId) ?? "",
      creditStatementId: row.creditStatementId,
    }));
  }

  stampBillableWithTx(tx: unknown, paymentIds: string[], statementId: string): Promise<void> {
    return this.payments.stampWithTx(tx, paymentIds, statementId);
  }

  settleForStatementWithTx(tx: unknown, statementId: string, paidAt: Date): Promise<void> {
    return this.payments.settleForStatementWithTx(tx, statementId, paidAt);
  }

  billedInstallmentsForStatement(statementId: string): Promise<{ amount: string; count: number }> {
    return this.payments.sumBilledForStatement(statementId);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.installmentPlan.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async removeWithTx(tx: unknown, userId: string, id: string): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.installmentPlan.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
