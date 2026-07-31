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

  async createMany(rows: Omit<TransactionPlan, "id">[]): Promise<number> {
    const result = await this.prisma.transaction.createMany({ data: rows });
    return result.count;
  }
}
