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
    const user = await userRepo.create({
      email,
      name: "List Sessions Test",
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
    await sessionRepo.rotateRefresh(
      userId,
      newer.id,
      null,
      randomUUID(),
      new Date(Date.now() + 1000),
      oneWeek,
    );

    const handler = new ListSessionsQueryHandler(sessionRepo);
    const result = await handler.execute(new ListSessionsQuery(userId, newer.id));

    expect(result.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(result.find((s) => s.id === newer.id)).toMatchObject({
      isCurrent: true,
      country: "CL",
      // "Santiago" here is historical MaxMind-era data, seeded directly (specs/026 never
      // resolves city for a NEW session, but must never touch an old row's stored value).
      city: "Santiago",
    });
    expect(result.find((s) => s.id === older.id)).toMatchObject({ isCurrent: false });
  });

  // 2026-11-15: a session opened over SESSION_MAX_AGE_DAYS ago can't be refreshed, so isAlive
  // (what GET /auth/session reads) must say so too, or the site and the app bounce forever.
  it("a session past the 30-day cap is neither refreshable nor alive", async () => {
    const old = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "Old browser",
      city: null,
      country: null,
      expiresAt: oneWeek.toISOString(),
    });
    await prisma.session.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    const now = new Date();
    expect(await sessionRepo.isAlive(userId, old.id, now)).toBe(false);
    expect(await sessionRepo.rotateRefresh(userId, old.id, null, randomUUID(), now, oneWeek)).toBe(
      "GONE",
    );
    const fresh = await sessionRepo.create({
      id: randomUUID(),
      userId,
      deviceLabel: "New browser",
      city: null,
      country: null,
      expiresAt: oneWeek.toISOString(),
    });
    expect(await sessionRepo.isAlive(userId, fresh.id, new Date())).toBe(true);
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
