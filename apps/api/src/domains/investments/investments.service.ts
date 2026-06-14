import { Injectable, NotFoundException } from "@nestjs/common";
import type { Investment as InvestmentRow } from "@prisma/client";

import { investments } from "@finance/contracts";

import { InvestmentsRepository } from "./investments.repository";

@Injectable()
export class InvestmentsService {
  constructor(private readonly repo: InvestmentsRepository) {}

  async list(userId: string): Promise<investments.Investment[]> {
    const rows = await this.repo.list(userId);
    return rows.map(toContract);
  }

  async get(userId: string, id: string): Promise<investments.Investment> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "INVESTMENT_NOT_FOUND" });
    return toContract(row);
  }

  async create(userId: string, input: investments.CreateInvestment): Promise<investments.Investment> {
    const row = await this.repo.create(userId, {
      kind: input.kind,
      label: input.label,
      currency: input.currency,
      symbol: input.symbol,
      shares: input.shares,
      annualRate: input.annualRate,
      principal: input.principal,
      bankAccountId: input.bankAccountId,
      openedAt: input.openedAt ? new Date(input.openedAt) : undefined,
    });
    return toContract(row);
  }

  async update(
    userId: string,
    id: string,
    input: investments.UpdateInvestment,
  ): Promise<investments.Investment> {
    const row = await this.repo.update(userId, id, {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
      ...(input.shares !== undefined ? { shares: input.shares } : {}),
      ...(input.annualRate !== undefined ? { annualRate: input.annualRate } : {}),
      ...(input.principal !== undefined ? { principal: input.principal } : {}),
      ...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {}),
      ...(input.openedAt !== undefined ? { openedAt: new Date(input.openedAt) } : {}),
    });
    if (!row) throw new NotFoundException({ code: "INVESTMENT_NOT_FOUND" });
    return toContract(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "INVESTMENT_NOT_FOUND" });
  }
}

function toContract(row: InvestmentRow): investments.Investment {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    currency: row.currency,
    symbol: row.symbol,
    shares: row.shares ? row.shares.toString() : null,
    annualRate: row.annualRate ? row.annualRate.toString() : null,
    principal: row.principal ? row.principal.toString() : null,
    bankAccountId: row.bankAccountId,
    openedAt: row.openedAt ? row.openedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
