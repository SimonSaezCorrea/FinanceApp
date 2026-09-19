import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { MfaRecoveryCodeRepositoryPort } from "../domain/ports/mfa-recovery-code.repository.port";

/** Adapter — the ONLY file that touches `prisma.mfaRecoveryCode`. */
@Injectable()
export class PrismaMfaRecoveryCodeRepository implements MfaRecoveryCodeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createManyWithTx(tx: unknown, userId: string, codeHashes: string[]): Promise<void> {
    const client = tx as PrismaService;
    await client.mfaRecoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({ userId, codeHash })),
    });
  }

  async countUnused(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  async findUnusedByUser(userId: string): Promise<{ id: string; codeHash: string }[]> {
    return this.prisma.mfaRecoveryCode.findMany({
      where: { userId, usedAt: null },
      select: { id: true, codeHash: true },
    });
  }

  async markUsedWithTx(tx: unknown, id: string): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.mfaRecoveryCode.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.mfaRecoveryCode.deleteMany({ where: { userId } });
  }
}
