import { Injectable, NotFoundException } from "@nestjs/common";
import type { Debt as DebtRow } from "@prisma/client";

import { debts } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { DebtsRepository } from "./debts.repository";

@Injectable()
export class DebtsService {
  constructor(private readonly repo: DebtsRepository) {}

  async list(userId: string): Promise<debts.Debt[]> {
    const rows = await this.repo.list(userId);
    return rows.map(toContract);
  }

  async get(userId: string, id: string): Promise<debts.Debt> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
    return toContract(row);
  }

  async create(userId: string, input: debts.CreateDebt): Promise<debts.Debt> {
    const row = await this.repo.create(userId, {
      direction: input.direction,
      counterparty: input.counterparty,
      principal: input.principal,
      currency: input.currency,
      openedAt: new Date(input.openedAt),
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      interestApr: input.interestApr,
      notes: input.notes,
    });
    return toContract(row);
  }

  async update(userId: string, id: string, input: debts.UpdateDebt): Promise<debts.Debt> {
    const row = await this.repo.update(userId, id, {
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.counterparty !== undefined ? { counterparty: input.counterparty } : {}),
      ...(input.principal !== undefined ? { principal: input.principal } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.openedAt !== undefined ? { openedAt: new Date(input.openedAt) } : {}),
      ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
      ...(input.interestApr !== undefined ? { interestApr: input.interestApr } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    if (!row) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
    return toContract(row);
  }

  async settle(userId: string, id: string): Promise<debts.Debt> {
    const row = await this.repo.update(userId, id, { settledAt: new Date() });
    if (!row) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
    return toContract(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
  }
}

function toContract(row: DebtRow): debts.Debt {
  return {
    id: row.id,
    direction: row.direction,
    counterparty: row.counterparty,
    principal: moneyToString(row.principal.toString()),
    currency: row.currency,
    openedAt: row.openedAt.toISOString(),
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    interestApr: row.interestApr ? moneyToString(row.interestApr.toString()) : null,
    notes: row.notes,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
