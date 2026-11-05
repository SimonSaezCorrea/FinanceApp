import { Injectable } from "@nestjs/common";
import { Prisma, type MfaCode as MfaCodeRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { MfaCodePlan, MfaCodeProps, MfaCodePurpose } from "../domain/mfa-code";
import type { MfaCodeRepositoryPort } from "../domain/ports/mfa-code.repository.port";

function rowToProps(row: MfaCodeRow): MfaCodeProps {
  return {
    id: row.id,
    userId: row.userId,
    purpose: row.purpose,
    channel: row.channel,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Adapter — the ONLY file that touches `prisma.mfaCode`. */
@Injectable()
export class PrismaMfaCodeRepository implements MfaCodeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async issue(plan: MfaCodePlan): Promise<{ issued: boolean }> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.mfaCode.updateMany({
          where: { userId: plan.userId, purpose: plan.purpose, usedAt: null },
          data: { usedAt: plan.createdAt },
        });
        await tx.mfaCode.create({ data: plan });
      });
      return { issued: true };
    } catch (err) {
      if (isUniqueViolation(err)) return { issued: false };
      throw err;
    }
  }

  async issuedSince(userId: string, purpose: MfaCodePurpose, since: Date): Promise<Date[]> {
    const rows = await this.prisma.mfaCode.findMany({
      where: { userId, purpose, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    return rows.map((r) => r.createdAt);
  }

  async findActive(
    userId: string,
    purpose: MfaCodePurpose,
    now: Date,
  ): Promise<MfaCodeProps | null> {
    const row = await this.prisma.mfaCode.findFirst({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: now } },
    });
    return row ? rowToProps(row) : null;
  }

  async consumeWithTx(tx: unknown, id: string, now: Date): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.mfaCode.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  async revokeActiveWithTx(
    tx: unknown,
    userId: string,
    purpose: MfaCodePurpose,
    now: Date,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.mfaCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });
  }

  async purgeStale(before: Date): Promise<number> {
    const result = await this.prisma.mfaCode.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { usedAt: { lt: before } }] },
    });
    return result.count;
  }
}
