import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CloseExpiredSessionsHandler } from "../../../../../src/domains/user/application/commands/close-expired-sessions.handler";
import { CloseExpiredSessionsCommand } from "../../../../../src/domains/user/application/commands/close-expired-sessions.command";
import { buildUserRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("CloseExpiredSessionsHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const email = `int_close_expired_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({
      email,
      name: "Close Expired Test",
      passwordHash: "x",
      birthDate: new Date("1990-01-01"),
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stamps closedAt on an open-but-time-expired session, leaves a still-valid one untouched", async () => {
    const expired = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Expired",
      city: null,
      country: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const active = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Active",
      city: null,
      country: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const handler = new CloseExpiredSessionsHandler({ publish: () => {} } as never, sessionRepo);
    const closed = await handler.execute(new CloseExpiredSessionsCommand(new Date()));

    expect(closed).toBeGreaterThanOrEqual(1);
    const rows = await prisma.session.findMany({ where: { userId } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(expired.id)?.closedAt).not.toBeNull();
    expect(byId.get(active.id)?.closedAt).toBeNull();
  });

  it("doesn't re-stamp a session that was already closed explicitly", async () => {
    const closedEarlier = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Closed early",
      city: null,
      country: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await sessionRepo.closeOwned(userId, closedEarlier.id);
    const before = await prisma.session.findUniqueOrThrow({ where: { id: closedEarlier.id } });

    const handler = new CloseExpiredSessionsHandler({ publish: () => {} } as never, sessionRepo);
    await handler.execute(new CloseExpiredSessionsCommand(new Date()));

    const after = await prisma.session.findUniqueOrThrow({ where: { id: closedEarlier.id } });
    expect(after.closedAt?.getTime()).toBe(before.closedAt?.getTime());
  });
});
