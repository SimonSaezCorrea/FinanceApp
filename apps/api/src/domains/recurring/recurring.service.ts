import { Injectable, NotFoundException } from "@nestjs/common";
import type { RecurringExpense as RecurringExpenseRow, RecurrenceFrequency } from "@prisma/client";

import { recurring } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { RecurringRepository } from "./recurring.repository";

/** Next occurrence on/after `from`, stepping forward from the anchor by frequency × interval. */
export function nextDue(
  anchor: Date,
  frequency: RecurrenceFrequency,
  interval: number,
  from: Date,
): Date {
  const d = new Date(anchor.getTime());
  const step = Math.max(1, interval);
  let guard = 0;
  while (d.getTime() < from.getTime() && guard < 10_000) {
    if (frequency === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7 * step);
    else if (frequency === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + step);
    else d.setUTCFullYear(d.getUTCFullYear() + step);
    guard++;
  }
  return d;
}

function startOfTodayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class RecurringService {
  constructor(private readonly repo: RecurringRepository) {}

  async list(userId: string): Promise<recurring.RecurringExpense[]> {
    const rows = await this.repo.list(userId);
    const today = startOfTodayUTC(new Date());
    return rows.map((r) => toContract(r, today));
  }

  async get(userId: string, id: string): Promise<recurring.RecurringExpense> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "RECURRING_NOT_FOUND" });
    return toContract(row, startOfTodayUTC(new Date()));
  }

  async create(
    userId: string,
    input: recurring.CreateRecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    const row = await this.repo.create(userId, {
      label: input.label,
      amount: input.amount,
      currency: input.currency,
      category: input.category,
      frequency: input.frequency,
      interval: input.interval,
      anchorDate: new Date(input.anchorDate),
      bankAccountId: input.bankAccountId,
      ...(input.active !== undefined ? { active: input.active } : {}),
      notes: input.notes,
    });
    return toContract(row, startOfTodayUTC(new Date()));
  }

  async update(
    userId: string,
    id: string,
    input: recurring.UpdateRecurringExpense,
  ): Promise<recurring.RecurringExpense> {
    const row = await this.repo.update(userId, id, {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.anchorDate !== undefined ? { anchorDate: new Date(input.anchorDate) } : {}),
      ...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    if (!row) throw new NotFoundException({ code: "RECURRING_NOT_FOUND" });
    return toContract(row, startOfTodayUTC(new Date()));
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "RECURRING_NOT_FOUND" });
  }
}

function toContract(row: RecurringExpenseRow, today: Date): recurring.RecurringExpense {
  return {
    id: row.id,
    label: row.label,
    amount: moneyToString(row.amount.toString()),
    currency: row.currency,
    category: row.category,
    frequency: row.frequency,
    interval: row.interval,
    anchorDate: row.anchorDate.toISOString(),
    bankAccountId: row.bankAccountId,
    active: row.active,
    notes: row.notes,
    nextDueAt: nextDue(row.anchorDate, row.frequency, row.interval, today).toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
