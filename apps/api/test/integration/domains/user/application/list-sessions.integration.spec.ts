import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ListSessionsQueryHandler } from "../../../../../src/domains/user/application/queries/list-sessions.handler";
import { ListSessionsQuery } from "../../../../../src/domains/user/application/queries/list-sessions.query";
import { buildUserRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("ListSessionsQueryHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const email = `int_list_sessions_${randomUUID()}@test.local`;
  let userId: string;
  const oneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({ email, name: "List Sessions Test", passwordHash: "x" });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("lists only this user's active sessions, most recently active first, marking the caller's own", async () => {
    const older = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Firefox · Linux",
      city: null,
      country: null,
      expiresAt: oneWeek.toISOString(),
    });
    const newer = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Chrome · Windows",
      city: "Santiago",
      country: "CL",
      expiresAt: oneWeek.toISOString(),
    });
    // Bump `newer`'s lastUsedAt so ordering is unambiguous regardless of clock resolution.
    await sessionRepo.touch(newer.id, new Date(Date.now() + 1000), oneWeek);

    const handler = new ListSessionsQueryHandler(sessionRepo);
    const result = await handler.execute(new ListSessionsQuery(userId, newer.id));

    expect(result.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(result.find((s) => s.id === newer.id)).toMatchObject({
      isCurrent: true,
      country: "CL",
    });
    expect(result.find((s) => s.id === older.id)).toMatchObject({ isCurrent: false });
  });

  it("an already-expired session still appears, but marked closed (not yet swept by the cron)", async () => {
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const expired = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Old device",
      city: null,
      country: null,
      expiresAt: expiredAt,
    });

    const handler = new ListSessionsQueryHandler(sessionRepo);
    const result = await handler.execute(new ListSessionsQuery(userId, "irrelevant"));

    expect(result.find((s) => s.id === expired.id)).toMatchObject({ closedAt: expiredAt });
  });
});
