import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  AccountDeletionMovement,
  InstallmentPlanMovement,
  TransactionPlan,
  TransactionWriterRepositoryPort,
} from "../domain/ports/transaction-writer.repository.port";
import { EXCLUDE_SETTLEMENTS } from "./prisma-transaction-sums.repository";

/** Adapter for the cross-domain write half of the `transaction` table. */
@Injectable()
export class PrismaTransactionWriterRepository implements TransactionWriterRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createWithTx(tx: unknown, plan: TransactionPlan): Promise<void> {
    const client = tx as PrismaService;
    await client.transaction.create({ data: plan });
  }

  async relinkToStatementWithTx(
    tx: unknown,
    input: {
      statementId: string;
      accountId: string;
      cardIds: string[] | null;
      from: Date;
      to: Date;
      currency: string;
    },
  ): Promise<void> {
    const client = tx as PrismaService;
    const window = {
      bankAccountId: input.accountId,
      occurredAt: { gte: input.from, lt: input.to },
      currency: input.currency,
      ...EXCLUDE_SETTLEMENTS,
    };
    await client.transaction.updateMany({
      where:
        input.cardIds === null
          ? window
          : { ...window, type: "EXPENSE" as const, cardId: { in: input.cardIds } },
      data: { creditStatementId: input.statementId },
    });
  }

  async updateAmountWithTx(tx: unknown, id: string, amount: string): Promise<void> {
    const client = tx as PrismaService;
    await client.transaction.update({ where: { id }, data: { amount } });
  }

  async deleteWithTx(tx: unknown, id: string): Promise<void> {
    const client = tx as PrismaService;
    await client.transaction.delete({ where: { id } });
  }

  async listForInstallmentPlan(userId: string, planId: string): Promise<InstallmentPlanMovement[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, installmentPlanId: planId },
      select: {
        id: true,
        bankAccountId: true,
        type: true,
        amount: true,
        financeCharge: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      bankAccountId: r.bankAccountId,
      type: r.type,
      amount: r.amount.toString(),
      financeCharge: r.financeCharge,
    }));
  }

  async deleteManyWithTx(tx: unknown, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const client = tx as PrismaService;
    await client.transaction.deleteMany({ where: { id: { in: ids } } });
  }

  async listForAccountDeletion(
    userId: string,
    accountId: string,
    extraIds: string[],
  ): Promise<AccountDeletionMovement[]> {
    const select = {
      id: true,
      bankAccountId: true,
      type: true,
      amount: true,
      currency: true,
      transferGroupId: true,
    } as const;
    const own = await this.prisma.transaction.findMany({
      where: { userId, bankAccountId: accountId },
      select,
    });
    const groups = [
      ...new Set(own.map((r) => r.transferGroupId).filter((g): g is string => g !== null)),
    ];
    const elsewhere = await this.prisma.transaction.findMany({
      where: {
        userId,
        NOT: { bankAccountId: accountId },
        OR: [
          ...(groups.length > 0 ? [{ transferGroupId: { in: groups } }] : []),
          { prepaymentAccountId: accountId },
          ...(extraIds.length > 0 ? [{ id: { in: extraIds } }] : []),
        ],
      },
      select,
    });
    return [...own, ...elsewhere].map((r) => ({
      id: r.id,
      bankAccountId: r.bankAccountId,
      type: r.type,
      amount: r.amount.toString(),
      currency: r.currency,
      transfer: r.transferGroupId !== null,
    }));
  }

  async accountIdForTransaction(userId: string, id: string): Promise<string | null> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { bankAccountId: true },
    });
    return row?.bankAccountId ?? null;
  }

  async amountForTransaction(userId: string, id: string): Promise<string | null> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { amount: true },
    });
    return row ? row.amount.toFixed(4) : null;
  }

  /** A row may carry its own `id` (pre-minted by the caller so a payment or a
   * contribution can point at its movement without reading it back); one that
   * doesn't gets the schema's UUID v7 default. */
  async createManyWithTx(
    tx: unknown,
    rows: (Omit<TransactionPlan, "id"> & { id?: string })[],
  ): Promise<number> {
    const client = tx as PrismaService;
    const result = await client.transaction.createMany({ data: rows });
    return result.count;
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.transaction.count({ where: { userId } });
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    await (tx as PrismaService).transaction.deleteMany({ where: { userId } });
  }
}
