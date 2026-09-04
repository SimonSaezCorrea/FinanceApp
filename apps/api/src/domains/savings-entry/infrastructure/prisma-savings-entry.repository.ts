import { Injectable } from "@nestjs/common";
import type { SavingsEntry as SavingsEntryRow, Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  SavingsEntry,
  type PlannedSavingsEntry,
  type SavingsEntryProps,
} from "../domain/savings-entry.aggregate";
import type { SavingsEntryRepositoryPort } from "../domain/ports/savings-entry.repository.port";

function rowToProps(row: SavingsEntryRow): SavingsEntryProps {
  return {
    id: row.id,
    userId: row.userId,
    savingsGoalId: row.savingsGoalId,
    amount: row.amount.toString(),
    currency: row.currency,
    contributedAt: row.contributedAt,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/** Adapter (FR-011) — the other file in `savings` allowed to import
 * `@prisma/client`. */
@Injectable()
export class PrismaSavingsEntryRepository implements SavingsEntryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavingsEntry[]> {
    const rows = await this.prisma.savingsEntry.findMany({
      where: { userId },
      orderBy: { contributedAt: "desc" },
    });
    return rows.map((r) => SavingsEntry.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<SavingsEntry | null> {
    const row = await this.prisma.savingsEntry.findFirst({ where: { id, userId } });
    return row ? SavingsEntry.fromPersistence(rowToProps(row)) : null;
  }

  create(userId: string, plan: PlannedSavingsEntry): Promise<SavingsEntry> {
    return this.createWithTx(this.prisma, userId, plan);
  }

  /** Enlisted in the caller's transaction, so the entry and the idempotency
   * record's COMPLETED mark commit together. */
  async createWithTx(
    tx: unknown,
    userId: string,
    plan: PlannedSavingsEntry,
  ): Promise<SavingsEntry> {
    const client = tx as PrismaService;
    const data: Prisma.SavingsEntryUncheckedCreateInput = {
      userId,
      savingsGoalId: plan.savingsGoalId,
      amount: plan.amount,
      currency: plan.currency,
      contributedAt: plan.contributedAt,
      note: plan.note,
    };
    const row = await client.savingsEntry.create({ data });
    return SavingsEntry.fromPersistence(rowToProps(row));
  }

  async save(aggregate: SavingsEntry): Promise<void> {
    const snap = aggregate.snapshot();
    const data: Prisma.SavingsEntryUncheckedUpdateInput = {
      savingsGoalId: snap.savingsGoalId,
      amount: snap.amount,
      currency: snap.currency,
      contributedAt: snap.contributedAt,
      note: snap.note,
    };
    await this.prisma.savingsEntry.updateMany({
      where: { id: snap.id, userId: snap.userId },
      data,
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.savingsEntry.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
