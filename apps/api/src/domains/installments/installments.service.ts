import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  InstallmentFrequency,
  InstallmentPayment as PaymentRow,
  InstallmentPlan as PlanRow,
} from "@prisma/client";

import { installments } from "@finance/contracts";
import { equalPrincipalSchedule, moneyToString } from "@finance/money";

import { InstallmentsRepository } from "./installments.repository";

type PlanWithPayments = PlanRow & { payments: PaymentRow[] };

@Injectable()
export class InstallmentsService {
  constructor(private readonly repo: InstallmentsRepository) {}

  async list(userId: string): Promise<installments.InstallmentPlan[]> {
    const rows = await this.repo.list(userId);
    return rows.map(toContract);
  }

  async get(userId: string, id: string): Promise<installments.InstallmentPlan> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "INSTALLMENT_PLAN_NOT_FOUND" });
    return toContract(row);
  }

  async create(
    userId: string,
    input: installments.CreateInstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    const start = new Date(input.startDate);
    const freq = input.frequency ?? "MONTHLY";
    const interval = input.frequencyInterval ?? 1;

    const schedule = equalPrincipalSchedule({
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      aprPerPeriod: input.aprPerPeriod,
    });

    const payments = schedule.map((row) => ({
      sequence: row.sequence,
      dueDate: addPeriod(start, row.sequence - 1, freq, interval),
      amount: row.payment,
    }));

    const row = await this.repo.createWithPayments(
      userId,
      {
        title: input.title,
        totalPrincipal: input.totalPrincipal,
        installmentCount: input.installmentCount,
        startDate: start,
        currency: input.currency,
        frequency: freq,
        frequencyInterval: interval,
        notes: input.notes,
      },
      payments,
    );
    return toContract(row);
  }

  async update(
    userId: string,
    id: string,
    input: installments.UpdateInstallmentPlan,
  ): Promise<installments.InstallmentPlan> {
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data["title"] = input.title;
    if (input.currency !== undefined) data["currency"] = input.currency;
    if (input.frequency !== undefined) data["frequency"] = input.frequency;
    if (input.frequencyInterval !== undefined) data["frequencyInterval"] = input.frequencyInterval;
    if (input.notes !== undefined) data["notes"] = input.notes;
    const row = await this.repo.update(userId, id, data);
    if (!row) throw new NotFoundException({ code: "INSTALLMENT_PLAN_NOT_FOUND" });
    return toContract(row);
  }

  async pay(userId: string, planId: string, sequence: number): Promise<void> {
    const ok = await this.repo.markPaid(userId, planId, sequence);
    if (!ok) throw new NotFoundException({ code: "INSTALLMENT_PAYMENT_NOT_FOUND" });
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "INSTALLMENT_PLAN_NOT_FOUND" });
  }
}

function addPeriod(date: Date, n: number, freq: InstallmentFrequency, interval: number): Date {
  const d = new Date(date);
  const step = n * interval;
  switch (freq) {
    case "DAILY":
      d.setDate(d.getDate() + step);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + step * 7);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      d.setMonth(d.getMonth() + step);
  }
  return d;
}

function toContract(plan: PlanWithPayments): installments.InstallmentPlan {
  return {
    id: plan.id,
    title: plan.title,
    totalPrincipal: moneyToString(plan.totalPrincipal.toString()),
    installmentCount: plan.installmentCount,
    startDate: plan.startDate.toISOString(),
    currency: plan.currency,
    frequency: plan.frequency,
    frequencyInterval: plan.frequencyInterval,
    notes: plan.notes,
    payments: plan.payments.map((p) => ({
      id: p.id,
      sequence: p.sequence,
      dueDate: p.dueDate.toISOString(),
      amount: moneyToString(p.amount.toString()),
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
