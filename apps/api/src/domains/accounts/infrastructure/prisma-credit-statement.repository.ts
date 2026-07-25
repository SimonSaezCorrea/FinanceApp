import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CreditStatement, type CreditStatementProps } from "../domain/credit-statement.aggregate";
import type { CreditStatementRepositoryPort } from "../domain/ports/credit-statement.repository.port";

type Row = {
  id: string;
  accountId: string;
  periodStart: Date;
  closedAt: Date | null;
  paidAt: Date | null;
  amount: { toString(): string } | null;
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
    paidFromAccountId: row.paidFromAccountId,
    paidTransactionId: row.paidTransactionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — the only file in `accounts`' `CreditStatement` slice
 * allowed to import `@prisma/client`. */
@Injectable()
export class PrismaCreditStatementRepository implements CreditStatementRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string, accountId: string, statementId: string): Promise<CreditStatement | null> {
    const row = await this.prisma.creditStatement.findFirst({
      where: { id: statementId, accountId, account: { userId } },
    });
    return row ? CreditStatement.fromPersistence(rowToProps(row)) : null;
  }

  async findOpenForAccount(accountId: string): Promise<CreditStatement | null> {
    const row = await this.prisma.creditStatement.findFirst({ where: { accountId, closedAt: null } });
    return row ? CreditStatement.fromPersistence(rowToProps(row)) : null;
  }

  async listForAccount(userId: string, accountId: string): Promise<CreditStatement[]> {
    const rows = await this.prisma.creditStatement.findMany({
      where: { accountId, account: { userId } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => CreditStatement.fromPersistence(rowToProps(r)));
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
        amount: state.paidAt ? state.amount : undefined,
        paidFromAccountId: state.paidFromAccountId,
        paidTransactionId: state.paidTransactionId,
      },
    });
  }

  async sumLinkedTransactions(statementId: string): Promise<string> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { creditStatementId: statementId },
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") => grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return new Prisma.Decimal(find("EXPENSE")).minus(find("INCOME")).toString();
  }
}
