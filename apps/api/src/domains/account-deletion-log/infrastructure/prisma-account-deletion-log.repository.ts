import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { AccountDeletionLogRepositoryPort } from "../domain/ports/account-deletion-log.repository.port";

/** Adapter — the ONLY file that touches `prisma.accountDeletionLog`. */
@Injectable()
export class PrismaAccountDeletionLogRepository implements AccountDeletionLogRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createWithTx(
    tx: unknown,
    keepHistory: boolean,
    identifierHash: string | null,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.accountDeletionLog.create({ data: { keepHistory, identifierHash } });
  }
}
