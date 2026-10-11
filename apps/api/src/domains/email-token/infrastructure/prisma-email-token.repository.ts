import { Injectable } from "@nestjs/common";
import { Prisma, type EmailToken as EmailTokenRow } from "@prisma/client";

import { generateRowId } from "../../../infra/id/generate-row-id";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { EmailTokenPlan, EmailTokenProps, EmailTokenPurpose } from "../domain/email-token";
import type { EmailTokenRepositoryPort } from "../domain/ports/email-token.repository.port";

function rowToProps(row: EmailTokenRow): EmailTokenProps {
  return {
    id: row.id,
    userId: row.userId,
    purpose: row.purpose,
    userEmailId: row.userEmailId,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Adapter — the ONLY file that touches `prisma.emailToken`. */
@Injectable()
export class PrismaEmailTokenRepository implements EmailTokenRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async issue(plan: EmailTokenPlan): Promise<{ issued: true; id: string } | { issued: false }> {
    const id = generateRowId();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.emailToken.updateMany({
          where: { userId: plan.userId, purpose: plan.purpose, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.emailToken.create({ data: { id, ...plan } });
      });
      return { issued: true, id };
    } catch (err) {
      if (isUniqueViolation(err)) return { issued: false };
      throw err;
    }
  }

  countSince(userId: string, purpose: EmailTokenPurpose, since: Date): Promise<number> {
    return this.prisma.emailToken.count({ where: { userId, purpose, createdAt: { gte: since } } });
  }

  async findActive(userId: string, purpose: EmailTokenPurpose): Promise<EmailTokenProps | null> {
    const row = await this.prisma.emailToken.findFirst({
      where: { userId, purpose, usedAt: null },
    });
    return row ? rowToProps(row) : null;
  }

  async consumeWithTx(
    tx: unknown,
    tokenHash: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<EmailTokenProps | null> {
    const client = tx as PrismaService;
    const result = await client.emailToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (result.count === 0) return null;
    const row = await client.emailToken.findUnique({ where: { tokenHash } });
    return row ? rowToProps(row) : null;
  }

  async revokeActiveWithTx(
    tx: unknown,
    userId: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<void> {
    const client = tx as PrismaService;
    await client.emailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.emailToken.deleteMany({ where: { userId } });
  }

  async purgeStale(before: Date): Promise<number> {
    const result = await this.prisma.emailToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { usedAt: { lt: before } }] },
    });
    return result.count;
  }
}
