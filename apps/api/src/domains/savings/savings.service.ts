import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  SavingsEntry as SavingsEntryRow,
  SavingsGoal as SavingsGoalRow,
} from "@prisma/client";

import { savings } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { SavingsRepository } from "./savings.repository";

@Injectable()
export class SavingsService {
  constructor(private readonly repo: SavingsRepository) {}

  async listGoals(userId: string): Promise<savings.SavingsGoal[]> {
    const rows = await this.repo.listGoals(userId);
    return rows.map(goalToContract);
  }

  async getGoal(userId: string, id: string): Promise<savings.SavingsGoal> {
    const row = await this.repo.findGoal(userId, id);
    if (!row) throw new NotFoundException({ code: "SAVINGS_GOAL_NOT_FOUND" });
    return goalToContract(row);
  }

  async createGoal(userId: string, input: savings.CreateSavingsGoal): Promise<savings.SavingsGoal> {
    const row = await this.repo.createGoal(userId, {
      title: input.title,
      targetAmount: input.targetAmount,
      currency: input.currency,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
    });
    return goalToContract(row);
  }

  async updateGoal(
    userId: string,
    id: string,
    input: savings.UpdateSavingsGoal,
  ): Promise<savings.SavingsGoal> {
    const row = await this.repo.updateGoal(userId, id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.targetAmount !== undefined ? { targetAmount: input.targetAmount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.deadline !== undefined ? { deadline: new Date(input.deadline) } : {}),
    });
    if (!row) throw new NotFoundException({ code: "SAVINGS_GOAL_NOT_FOUND" });
    return goalToContract(row);
  }

  async removeGoal(userId: string, id: string): Promise<void> {
    const ok = await this.repo.removeGoal(userId, id);
    if (!ok) throw new NotFoundException({ code: "SAVINGS_GOAL_NOT_FOUND" });
  }

  async listEntries(userId: string): Promise<savings.SavingsEntry[]> {
    const rows = await this.repo.listEntries(userId);
    return rows.map(entryToContract);
  }

  async createEntry(
    userId: string,
    input: savings.CreateSavingsEntry,
  ): Promise<savings.SavingsEntry> {
    const row = await this.repo.createEntry(userId, {
      savingsGoalId: input.savingsGoalId,
      amount: input.amount,
      currency: input.currency,
      contributedAt: new Date(input.contributedAt),
      note: input.note,
    });
    return entryToContract(row);
  }
}

function goalToContract(row: SavingsGoalRow): savings.SavingsGoal {
  return {
    id: row.id,
    title: row.title,
    targetAmount: moneyToString(row.targetAmount.toString()),
    currency: row.currency,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function entryToContract(row: SavingsEntryRow): savings.SavingsEntry {
  return {
    id: row.id,
    savingsGoalId: row.savingsGoalId,
    amount: moneyToString(row.amount.toString()),
    currency: row.currency,
    contributedAt: row.contributedAt.toISOString(),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
