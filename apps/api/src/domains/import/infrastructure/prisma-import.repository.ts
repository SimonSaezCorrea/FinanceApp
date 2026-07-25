import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { PlannedImportRow } from "../domain/import-batch";
import type { ImportTransactionsRepositoryPort } from "../domain/ports/import-transactions.repository.port";

/** Adapter (FR-011) — the only file in `import` allowed to import
 * `@prisma/client` (via `PrismaService`). */
@Injectable()
export class PrismaImportRepository implements ImportTransactionsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async importRows(userId: string, rows: PlannedImportRow[]): Promise<number> {
    const result = await this.prisma.transaction.createMany({
      data: rows.map((r) => ({
        userId,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        occurredAt: r.occurredAt,
        category: r.category,
        description: r.description,
        bankAccountId: r.bankAccountId,
      })),
    });
    return result.count;
  }
}
