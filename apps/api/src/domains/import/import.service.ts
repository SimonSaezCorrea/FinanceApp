import { Injectable } from "@nestjs/common";

import * as contracts from "@finance/contracts";

import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importTransactions(
    userId: string,
    input: contracts.imports.ImportTransactionsRequest,
  ): Promise<contracts.imports.ImportResult> {
    const result = await this.prisma.transaction.createMany({
      data: input.rows.map((r) => ({
        userId,
        type: r.type,
        amount: r.amount,
        currency: r.currency,
        occurredAt: new Date(r.occurredAt),
        category: r.category,
        description: r.description,
        bankAccountId: r.bankAccountId,
      })),
    });
    return { imported: result.count };
  }
}
