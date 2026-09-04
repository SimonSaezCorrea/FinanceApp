import { Injectable } from "@nestjs/common";
import type { Debt as DebtRow, Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { Debt, type DebtProps, type PlannedDebt } from "../domain/debt.aggregate";
import type { DebtRepositoryPort } from "../domain/ports/debt.repository.port";

function rowToProps(row: DebtRow): DebtProps {
  return {
    id: row.id,
    userId: row.userId,
    direction: row.direction,
    counterparty: row.counterparty,
    principal: row.principal.toString(),
    currency: row.currency,
    openedAt: row.openedAt,
    dueAt: row.dueAt,
    interestApr: row.interestApr ? row.interestApr.toString() : null,
    notes: row.notes,
    settledAt: row.settledAt,
    totalInstallments: row.totalInstallments,
    paidInstallments: row.paidInstallments,
    installmentAmount: row.installmentAmount ? row.installmentAmount.toString() : null,
    frequency: row.frequency,
    frequencyInterval: row.frequencyInterval,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — the only file in `debts` allowed to import
 * `@prisma/client`. */
@Injectable()
export class PrismaDebtRepository implements DebtRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Debt[]> {
    const rows = await this.prisma.debt.findMany({
      where: { userId },
      orderBy: { openedAt: "desc" },
    });
    return rows.map((r) => Debt.fromPersistence(rowToProps(r)));
  }

  async findOne(userId: string, id: string): Promise<Debt | null> {
    const row = await this.prisma.debt.findFirst({ where: { id, userId } });
    return row ? Debt.fromPersistence(rowToProps(row)) : null;
  }

  async create(userId: string, plan: PlannedDebt): Promise<Debt> {
    const data: Prisma.DebtUncheckedCreateInput = {
      userId,
      direction: plan.direction,
      counterparty: plan.counterparty,
      principal: plan.principal,
      currency: plan.currency,
      openedAt: plan.openedAt,
      dueAt: plan.dueAt,
      interestApr: plan.interestApr,
      notes: plan.notes,
      totalInstallments: plan.totalInstallments,
      installmentAmount: plan.installmentAmount,
      frequency: plan.frequency,
      frequencyInterval: plan.frequencyInterval,
    };
    const row = await this.prisma.debt.create({ data });
    return Debt.fromPersistence(rowToProps(row));
  }

  save(aggregate: Debt): Promise<void> {
    return this.saveWithTx(this.prisma, aggregate);
  }

  /** Enlisted in the caller's transaction, alongside the idempotency record's
   * COMPLETED mark. On its own this makes the WRITE atomic — closing the race
   * requires reading the row inside the same transaction too, via
   * `findOneForUpdateWithTx`. */
  async saveWithTx(tx: unknown, aggregate: Debt): Promise<void> {
    const client = tx as PrismaService;
    const snap = aggregate.snapshot();
    const data: Prisma.DebtUpdateInput = {
      direction: snap.direction,
      counterparty: snap.counterparty,
      principal: snap.principal,
      currency: snap.currency,
      openedAt: snap.openedAt,
      dueAt: snap.dueAt,
      interestApr: snap.interestApr,
      notes: snap.notes,
      settledAt: snap.settledAt,
      totalInstallments: snap.totalInstallments,
      paidInstallments: snap.paidInstallments,
      installmentAmount: snap.installmentAmount,
      frequency: snap.frequency,
      frequencyInterval: snap.frequencyInterval,
    };
    await client.debt.updateMany({ where: { id: snap.id, userId: snap.userId }, data });
  }

  /**
   * `SELECT ... FOR UPDATE` inside the caller's transaction: a second
   * concurrent call for the SAME (userId, id) blocks on this query until the
   * first transaction commits or rolls back, instead of both reading the
   * pre-mutation row and one silently overwriting the other's write. This is
   * what actually closes the `paidInstallments += 1` race — `saveWithTx`
   * alone only makes the write atomic with the idempotency mark, not the
   * read against a concurrent read.
   */
  async findOneForUpdateWithTx(tx: unknown, userId: string, id: string): Promise<Debt | null> {
    const client = tx as PrismaService;
    const rows = await client.$queryRaw<DebtRow[]>`
      SELECT * FROM "debt" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE
    `;
    const row = rows[0];
    return row ? Debt.fromPersistence(rowToProps(row)) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.debt.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
