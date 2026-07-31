import { Injectable } from "@nestjs/common";
import type { Investment as InvestmentRow, Prisma } from "@prisma/client";

import { moneyToString } from "@finance/money";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { Investment, type InvestmentProps, type PlannedInvestment } from "../domain/investment.aggregate";
import type { InvestmentRepositoryPort } from "../domain/ports/investment.repository.port";

function rowToProps(row: InvestmentRow): InvestmentProps {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    label: row.label,
    currency: row.currency,
    symbol: row.symbol,
    shares: row.shares ? moneyToString(row.shares, 8) : null,
    annualRate: row.annualRate ? moneyToString(row.annualRate, 6) : null,
    principal: row.principal ? moneyToString(row.principal) : null,
    bankAccountId: row.bankAccountId,
    openedAt: row.openedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — the only file in `investments` allowed to import
 * `@prisma/client`. */
@Injectable()
export class PrismaInvestmentRepository implements InvestmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Investment[]> {
    const rows = await this.prisma.investment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => Investment.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<Investment | null> {
    const row = await this.prisma.investment.findFirst({ where: { id, userId } });
    return row ? Investment.fromPersistence(rowToProps(row)) : null;
  }

  async create(userId: string, plan: PlannedInvestment): Promise<Investment> {
    const data: Prisma.InvestmentUncheckedCreateInput = {
      userId,
      kind: plan.kind,
      label: plan.label,
      currency: plan.currency,
      symbol: plan.symbol,
      shares: plan.shares,
      annualRate: plan.annualRate,
      principal: plan.principal,
      bankAccountId: plan.bankAccountId,
      openedAt: plan.openedAt,
    };
    const row = await this.prisma.investment.create({ data });
    return Investment.fromPersistence(rowToProps(row));
  }

  async save(aggregate: Investment): Promise<void> {
    const snap = aggregate.snapshot();
    const data: Prisma.InvestmentUncheckedUpdateInput = {
      kind: snap.kind,
      label: snap.label,
      currency: snap.currency,
      symbol: snap.symbol,
      shares: snap.shares,
      annualRate: snap.annualRate,
      principal: snap.principal,
      bankAccountId: snap.bankAccountId,
      openedAt: snap.openedAt,
    };
    await this.prisma.investment.updateMany({ where: { id: snap.id, userId: snap.userId }, data });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.investment.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
