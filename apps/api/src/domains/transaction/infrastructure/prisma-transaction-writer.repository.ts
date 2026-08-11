import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type {
  TransactionPlan,
  TransactionWriterRepositoryPort,
} from "../domain/ports/transaction-writer.repository.port";

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
    },
  ): Promise<void> {
    const client = tx as PrismaService;
    const window = {
      bankAccountId: input.accountId,
      occurredAt: { gte: input.from, lt: input.to },
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

  async createMany(rows: Omit<TransactionPlan, "id">[]): Promise<number> {
    const result = await this.prisma.transaction.createMany({ data: rows });
    return result.count;
  }
}
