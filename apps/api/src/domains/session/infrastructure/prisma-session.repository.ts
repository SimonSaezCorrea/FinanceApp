import { Injectable } from "@nestjs/common";
import type { Session as SessionRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { SessionPlan, SessionProps } from "../domain/session.entity";
import type { SessionRepositoryPort } from "../domain/ports/session.repository.port";
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
export class PrismaSessionRepository implements SessionRepositoryPort, SessionStepUpPort {
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

  async create(plan: SessionPlan): Promise<SessionProps> {
    const row = await this.prisma.session.create({
      data: {
        id: plan.id,
        userId: plan.userId,
        deviceLabel: plan.deviceLabel,
        country: plan.country,
        city: plan.city,
        expiresAt: new Date(plan.expiresAt),
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

  async touch(id: string, lastUsedAt: Date, expiresAt: Date): Promise<SessionProps | null> {
    const { count } = await this.prisma.session.updateMany({
      where: { id, closedAt: null, expiresAt: { gt: new Date() } },
      data: { lastUsedAt, expiresAt },
    });
    if (count === 0) return null;
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row ? rowToProps(row) : null;
  }

  async closeOwned(userId: string, id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, userId, closedAt: null },
      data: { closedAt: new Date() },
    });
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
