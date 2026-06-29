import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
      totalInstallments: input.totalInstallments,
      installmentAmount: input.installmentAmount,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
    });
    return toContract(row);
  }

  async update(userId: string, id: string, input: debts.UpdateDebt): Promise<debts.Debt> {
    const data: Record<string, unknown> = {};
    if (input.direction !== undefined) data["direction"] = input.direction;
    if (input.counterparty !== undefined) data["counterparty"] = input.counterparty;
    if (input.principal !== undefined) data["principal"] = input.principal;
    if (input.currency !== undefined) data["currency"] = input.currency;
    if (input.openedAt !== undefined) data["openedAt"] = new Date(input.openedAt);
    if (input.dueAt !== undefined) data["dueAt"] = new Date(input.dueAt);
    if (input.interestApr !== undefined) data["interestApr"] = input.interestApr;
    if (input.notes !== undefined) data["notes"] = input.notes;
    if (input.totalInstallments !== undefined) data["totalInstallments"] = input.totalInstallments;
    if (input.installmentAmount !== undefined) data["installmentAmount"] = input.installmentAmount;
    if (input.frequency !== undefined) data["frequency"] = input.frequency;
    if (input.frequencyInterval !== undefined) data["frequencyInterval"] = input.frequencyInterval;
    const row = await this.repo.update(userId, id, data);
    if (!row) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
    return toContract(row);
  }

  async settle(userId: string, id: string): Promise<debts.Debt> {
    const row = await this.repo.update(userId, id, { settledAt: new Date() });
    if (!row) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
    return toContract(row);
  }

  async registerPayment(userId: string, id: string): Promise<debts.Debt> {
    const existing = await this.repo.findOne(userId, id);
    if (!existing) throw new NotFoundException({ code: "DEBT_NOT_FOUND" });
    if (existing.settledAt !== null) {
      throw new ConflictException({ code: "DEBT_ALREADY_SETTLED" });
    }
    if (existing.paidInstallments >= existing.totalInstallments) {
      throw new ConflictException({ code: "ALL_INSTALLMENTS_PAID" });
    }
    const newPaid = existing.paidInstallments + 1;
    const data: Record<string, unknown> = { paidInstallments: newPaid };
    if (newPaid === existing.totalInstallments) data["settledAt"] = new Date();
    const row = await this.repo.update(userId, id, data);
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
    totalInstallments: row.totalInstallments,
    paidInstallments: row.paidInstallments,
    installmentAmount: row.installmentAmount
      ? moneyToString(row.installmentAmount.toString())
      : null,
    frequency: row.frequency,
    frequencyInterval: row.frequencyInterval,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
