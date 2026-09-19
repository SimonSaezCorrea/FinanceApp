import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PurgeClosedSessionsHandler } from "../../../../../src/domains/user/application/commands/purge-closed-sessions.handler";
import { PurgeClosedSessionsCommand } from "../../../../../src/domains/user/application/commands/purge-closed-sessions.command";
import { buildUserRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PurgeClosedSessionsHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const email = `int_purge_closed_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({ email, name: "Purge Closed Test", passwordHash: "x" });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("deletes only sessions closed before the cutoff — open and recently-closed ones survive", async () => {
    const longClosed = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Long closed",
      city: null,
      country: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await prisma.session.update({
      where: { id: longClosed.id },
      data: { closedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) }, // 4 days ago
    });

    const recentlyClosed = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Recently closed",
      city: null,
      country: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await sessionRepo.closeOwned(userId, recentlyClosed.id);

    const open = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Open",
      city: null,
      country: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const handler = new PurgeClosedSessionsHandler({ publish: () => {} } as never, sessionRepo);
    const purged = await handler.execute(new PurgeClosedSessionsCommand(cutoff));

    expect(purged).toBeGreaterThanOrEqual(1);
    const rows = await prisma.session.findMany({ where: { userId } });
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(longClosed.id);
    expect(ids).toContain(recentlyClosed.id);
    expect(ids).toContain(open.id);
  });
});
