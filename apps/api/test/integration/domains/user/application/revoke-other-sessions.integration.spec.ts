import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RevokeOtherSessionsHandler } from "../../../../../src/domains/user/application/commands/revoke-other-sessions.handler";
import { RevokeOtherSessionsCommand } from "../../../../../src/domains/user/application/commands/revoke-other-sessions.command";
import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { buildUserRepo, noopIpGeolocationCacheRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("RevokeOtherSessionsHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const config = new ConfigService({
    JWT_ACCESS_SECRET: "test-access",
    JWT_REFRESH_SECRET: "test-refresh",
  });
  const tokenIssuer = new TokenIssuer(new JwtService(), config);
  const sessionIssuer = new SessionIssuer(
    tokenIssuer,
    sessionRepo,
    new GeoIpLookup(config, noopIpGeolocationCacheRepo()),
  );
  const email = `int_revoke_others_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({
      email,
      name: "Revoke Others Test",
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

  it("3 real sessions: revoking from one closes the other two, leaves that one open", async () => {
    const a = await sessionIssuer.establish({ id: userId, email });
    const b = await sessionIssuer.establish({ id: userId, email });
    const c = await sessionIssuer.establish({ id: userId, email });

    const handler = new RevokeOtherSessionsHandler({ publish: () => {} } as never, sessionRepo);
    await handler.execute(new RevokeOtherSessionsCommand(userId, a.sessionId));

    // All three rows still exist (nothing is deleted here — only the daily cron's
    // retention purge does that) but only `a` is still open.
    const rows = await prisma.session.findMany({ where: { userId } });
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a.sessionId)?.closedAt).toBeNull();
    expect(byId.get(b.sessionId)?.closedAt).not.toBeNull();
    expect(byId.get(c.sessionId)?.closedAt).not.toBeNull();
  });
});
