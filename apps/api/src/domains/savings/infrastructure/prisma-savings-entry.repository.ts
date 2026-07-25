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

  async create(userId: string, plan: PlannedSavingsEntry): Promise<SavingsEntry> {
    const data: Prisma.SavingsEntryUncheckedCreateInput = {
      userId,
      savingsGoalId: plan.savingsGoalId,
      amount: plan.amount,
      currency: plan.currency,
      contributedAt: plan.contributedAt,
      note: plan.note,
    };
    const row = await this.prisma.savingsEntry.create({ data });
    return SavingsEntry.fromPersistence(rowToProps(row));
  }
}
