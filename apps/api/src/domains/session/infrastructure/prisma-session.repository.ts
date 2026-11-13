import { Injectable } from "@nestjs/common";
import type { Session as SessionRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  REFRESH_REUSE_GRACE_SECONDS,
  SESSION_MAX_AGE_DAYS,
  type RefreshRotation,
  type SessionPlan,
  type SessionProps,
} from "../domain/session.entity";
import type { SessionRepositoryPort } from "../domain/ports/session.repository.port";
import type { SessionStatusPort } from "../domain/ports/session-status.port";
import type { SessionStepUpPort } from "../domain/ports/session-step-up.port";

function rowToProps(row: SessionRow): SessionProps {
  return {
    id: row.id,
    userId: row.userId,
    deviceLabel: row.deviceLabel,
    country: row.country,
    city: row.city,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

/** Adapter — the ONLY file that touches `prisma.session`. */
@Injectable()
export class PrismaSessionRepository
  implements SessionRepositoryPort, SessionStepUpPort, SessionStatusPort
{
  constructor(private readonly prisma: PrismaService) {}

  async markSteppedUp(userId: string, sessionId: string, at: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, closedAt: null },
      data: { stepUpAt: at },
    });
  }

  async steppedUpAt(userId: string, sessionId: string): Promise<Date | null> {
    const row = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { stepUpAt: true },
    });
    return row?.stepUpAt ?? null;
  }

  async consumeWithTx(tx: unknown, userId: string, sessionId: string, at: Date): Promise<boolean> {
    const client = tx as PrismaService;
    const result = await client.session.updateMany({
      where: { id: sessionId, userId, stepUpAt: at },
      data: { stepUpAt: null },
    });
    return result.count === 1;
  }

  async create(plan: SessionPlan): Promise<SessionProps> {
    const row = await this.prisma.session.create({
      data: {
        id: plan.id,
        userId: plan.userId,
        deviceLabel: plan.deviceLabel,
        country: plan.country,
        city: plan.city,
        expiresAt: new Date(plan.expiresAt),
        passkeyId: plan.passkeyId ?? null,
        refreshJti: plan.refreshJti ?? null,
      },
    });
    return rowToProps(row);
  }

  async listByUser(userId: string): Promise<SessionProps[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "desc" },
    });
    return rows.map(rowToProps);
  }

  async rotateRefresh(
    userId: string,
    id: string,
    presentedJti: string | null,
    newJti: string,
    now: Date,
    expiresAt: Date,
  ): Promise<RefreshRotation> {
    const oldest = new Date(now.getTime() - SESSION_MAX_AGE_DAYS * 86_400_000);
    const graceSince = new Date(now.getTime() - REFRESH_REUSE_GRACE_SECONDS * 1000);
    // Raw SQL because the update reads a column into another ("previousRefreshJti" =
    // "refreshJti") and caps "expiresAt" by "createdAt", which Prisma's updateMany can't express.
    // Instants are passed as ISO strings cast to the column type (UTC wall time, like Prisma).
    const rotated = await this.prisma.$executeRaw`
      UPDATE "session" SET
        "previousRefreshJti" = "refreshJti",
        "refreshJti" = ${newJti},
        "refreshRotatedAt" = ${now.toISOString()}::timestamp(3),
        "lastUsedAt" = ${now.toISOString()}::timestamp(3),
        "expiresAt" = LEAST(
          ${expiresAt.toISOString()}::timestamp(3),
          "createdAt" + make_interval(days => ${SESSION_MAX_AGE_DAYS})
        )
      WHERE "id" = ${id}
        AND "userId" = ${userId}
        AND "closedAt" IS NULL
        AND "expiresAt" > ${now.toISOString()}::timestamp(3)
        AND "createdAt" > ${oldest.toISOString()}::timestamp(3)
        AND (
          "refreshJti" IS NULL
          OR "refreshJti" = ${presentedJti}
          OR ("previousRefreshJti" = ${presentedJti}
              AND "refreshRotatedAt" > ${graceSince.toISOString()}::timestamp(3))
        )`;
    if (rotated > 0) return "ROTATED";
    const open = await this.prisma.session.count({
      where: { id, userId, closedAt: null, expiresAt: { gt: now }, createdAt: { gt: oldest } },
    });
    return open > 0 ? "REUSED" : "GONE";
  }

  async closeOwned(userId: string, id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, userId, closedAt: null },
      data: { closedAt: new Date() },
    });
  }

  async isAlive(userId: string, sessionId: string, now: Date): Promise<boolean> {
    const row = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        closedAt: null,
        expiresAt: { gt: now },
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    return row !== null;
  }

  async existsForUser(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.session.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    return row !== null;
  }

  async closeAllExceptForUser(userId: string, exceptId: string): Promise<number> {
    return this.closeAllExceptForUserWithTx(this.prisma, userId, exceptId);
  }

  async closeAllExceptForUserWithTx(
    tx: unknown,
    userId: string,
    exceptId: string,
  ): Promise<number> {
    const client = tx as PrismaService;
    const result = await client.session.updateMany({
      where: { userId, id: { not: exceptId }, closedAt: null },
      data: { closedAt: new Date() },
    });
    return result.count;
  }

  async closeAllForUserWithTx(tx: unknown, userId: string): Promise<number> {
    const client = tx as PrismaService;
    const result = await client.session.updateMany({
      where: { userId, closedAt: null },
      data: { closedAt: new Date() },
    });
    return result.count;
  }

  async closeByPasskeysWithTx(
    tx: unknown,
    passkeyIds: readonly string[],
    now: Date,
    exceptSessionId?: string,
  ): Promise<number> {
    if (passkeyIds.length === 0) return 0;
    const client = tx as PrismaService;
    const result = await client.session.updateMany({
      where: {
        passkeyId: { in: [...passkeyIds] },
        closedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { closedAt: now },
    });
    return result.count;
  }

  async closeOnCompromisedPasskeysWithTx(tx: unknown, now: Date): Promise<number> {
    const client = tx as PrismaService;
    const result = await client.session.updateMany({
      where: { closedAt: null, passkey: { compromisedAt: { not: null } } },
      data: { closedAt: now },
    });
    return result.count;
  }

  async closeById(id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, closedAt: null },
      data: { closedAt: new Date() },
    });
  }

  async markExpiredAsClosed(now: Date): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { closedAt: null, expiresAt: { lte: now } },
      data: { closedAt: now },
    });
    return result.count;
  }

  async purgeClosedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { closedAt: { not: null, lte: cutoff } },
    });
    return result.count;
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.session.deleteMany({ where: { userId } });
  }
}
