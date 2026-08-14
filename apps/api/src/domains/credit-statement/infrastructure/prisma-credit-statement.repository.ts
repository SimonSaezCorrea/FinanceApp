import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../transaction/domain/ports/transaction-sums.repository.port";
import { CreditStatement, type CreditStatementProps } from "../domain/credit-statement.aggregate";
import type { CreditStatementRepositoryPort } from "../domain/ports/credit-statement.repository.port";

type Row = {
  id: string;
  accountId: string;
  periodStart: Date;
  closedAt: Date | null;
  paidAt: Date | null;
  amount: { toString(): string } | null;
  paidAmount: { toString(): string } | null;
  carriedOverAmount: { toString(): string } | null;
  carriedToId: string | null;
  paidFromAccountId: string | null;
  paidTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToProps(row: Row): CreditStatementProps {
  return {
    id: row.id,
    accountId: row.accountId,
    periodStart: row.periodStart,
    closedAt: row.closedAt,
    paidAt: row.paidAt,
    amount: row.amount?.toString() ?? "0",
    paidAmount: row.paidAmount?.toString() ?? "0",
    carriedOverAmount: row.carriedOverAmount?.toString() ?? "0",
    carriedToId: row.carriedToId,
    paidFromAccountId: row.paidFromAccountId,
    paidTransactionId: row.paidTransactionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter — the ONLY file that touches `prisma.creditStatement`. A period's
 * live amount is a sum over `transaction`, obtained through that table's own
 * port instead of querying it here. */
@Injectable()
export class PrismaCreditStatementRepository implements CreditStatementRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sums: TransactionSumsRepositoryPort,
  ) {}

  async findById(
    userId: string,
    accountId: string,
    statementId: string,
  ): Promise<CreditStatement | null> {
    const row = await this.prisma.creditStatement.findFirst({
      where: { id: statementId, accountId, account: { userId } },
    });
    return row ? CreditStatement.fromPersistence(rowToProps(row)) : null;
  }

  async findOpenForAccount(accountId: string): Promise<CreditStatement | null> {
    const row = await this.prisma.creditStatement.findFirst({
      where: { accountId, closedAt: null },
    });
    return row ? CreditStatement.fromPersistence(rowToProps(row)) : null;
  }

  async listForAccount(userId: string, accountId: string): Promise<CreditStatement[]> {
    const rows = await this.prisma.creditStatement.findMany({
      where: { accountId, account: { userId } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => CreditStatement.fromPersistence(rowToProps(r)));
  }

  async findOrCreateOpenForAccount(
    accountId: string,
    fallbackPeriodStart: Date,
  ): Promise<{ id: string }> {
    const open = await this.prisma.creditStatement.findFirst({
      where: { accountId, closedAt: null },
      select: { id: true },
    });
    if (open) return open;
    const last = await this.prisma.creditStatement.findFirst({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      select: { closedAt: true },
    });
    return this.prisma.creditStatement.create({
      data: { accountId, periodStart: last?.closedAt ?? fallbackPeriodStart },
      select: { id: true },
    });
  }

  async findOrCreateCarryOverTargetWithTx(
    tx: unknown,
    params: { accountId: string; excludeStatementId: string; periodStart: Date },
  ): Promise<{ id: string }> {
    const client = tx as PrismaService;
    const open = await client.creditStatement.findFirst({
      where: {
        accountId: params.accountId,
        closedAt: null,
        id: { not: params.excludeStatementId },
      },
      select: { id: true },
    });
    if (open) return open;
    return client.creditStatement.create({
      data: { accountId: params.accountId, periodStart: params.periodStart },
      select: { id: true },
    });
  }

  async addCarriedOverWithTx(tx: unknown, statementId: string, amount: string): Promise<void> {
    const client = tx as PrismaService;
    await client.creditStatement.update({
      where: { id: statementId },
      data: { carriedOverAmount: { increment: amount } },
    });
  }

  async isPaid(statementId: string): Promise<boolean> {
    const row = await this.prisma.creditStatement.findUnique({
      where: { id: statementId },
      select: { paidAt: true },
    });
    return row?.paidAt != null;
  }

  async save(aggregate: CreditStatement): Promise<void> {
    await this.saveWithTx(this.prisma, aggregate);
  }

  async saveWithTx(tx: unknown, aggregate: CreditStatement): Promise<void> {
    const client = tx as PrismaService;
    const state = aggregate.toPersistenceState();
    await client.creditStatement.update({
      where: { id: state.id },
      data: {
        closedAt: state.closedAt,
        paidAt: state.paidAt,
        // Frozen only once settled; while unpaid the amount stays live (the sum
        // of the period's transactions plus whatever was carried into it).
        amount: state.paidAt ? state.amount : undefined,
        paidAmount: state.paidAmount,
        carriedOverAmount: state.carriedOverAmount,
        carriedToId: state.carriedToId,
        paidFromAccountId: state.paidFromAccountId,
        paidTransactionId: state.paidTransactionId,
      },
    });
  }

  sumLinkedTransactions(statementId: string): Promise<string> {
    return this.sums.netForStatement(statementId);
  }

  breakdown(
    statementId: string,
  ): Promise<{ purchases: string; installments: string; installmentCount: number }> {
    return this.sums.breakdownForStatement(statementId);
  }
}
