import { Inject, Injectable } from "@nestjs/common";

import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../transaction/domain/ports/transaction-writer.repository.port";
import type { PlannedImportRow } from "../domain/import-batch";
import type { ImportTransactionsRepositoryPort } from "../domain/ports/import-transactions.repository.port";

/**
 * Adapter for the import flow. It owns no table of its own: an import creates
 * rows in the `transaction` table, so the write goes through THAT domain's
 * writer port — this file never touches Prisma directly (one table, one adapter).
 */
@Injectable()
export class PrismaImportRepository implements ImportTransactionsRepositoryPort {
  constructor(
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
  ) {}

  importRows(userId: string, rows: PlannedImportRow[]): Promise<number> {
    return this.transactions.createMany(
      rows.map((r) => ({
        userId,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        occurredAt: r.occurredAt,
        category: r.category,
        description: r.description,
        bankAccountId: r.bankAccountId,
      })),
    );
  }
}
