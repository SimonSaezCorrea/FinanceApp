import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ChangePasswordHandler } from "../../../../../src/domains/user/application/commands/change-password.handler";
import { ChangePasswordCommand } from "../../../../../src/domains/user/application/commands/change-password.command";
import { InvalidCurrentPasswordError } from "../../../../../src/domains/user/domain/errors";
import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { buildUserRepo, noopIpGeolocationCacheRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("ChangePasswordHandler (integration)", () => {
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
  const email = `int_change_password_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const passwordHash = await hash("correct-pw", 4);
    const user = await prisma.user.create({
      data: { email, name: "Change Password Test", passwordHash },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("changing the password from one of 3 real sessions closes the other two, keeps that one open", async () => {
    const a = await sessionIssuer.establish({ id: userId, email });
    const b = await sessionIssuer.establish({ id: userId, email });
    const c = await sessionIssuer.establish({ id: userId, email });

    const handler = new ChangePasswordHandler(
      { publish: () => {} } as never,
      userRepo,
      sessionRepo,
      prisma,
    );
    await handler.execute(
      new ChangePasswordCommand(
        userId,
        { currentPassword: "correct-pw", newPassword: "new-correct-pw-123" },
        a.sessionId,
      ),
    );

    const rows = await prisma.session.findMany({ where: { userId } });
    expect(rows).toHaveLength(3);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a.sessionId)?.closedAt).toBeNull();
    expect(byId.get(b.sessionId)?.closedAt).not.toBeNull();
    expect(byId.get(c.sessionId)?.closedAt).not.toBeNull();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.passwordHash).not.toBe(null);
  });

  it("an incorrect current password changes nothing and closes no session", async () => {
    const a = await sessionIssuer.establish({ id: userId, email });
    const b = await sessionIssuer.establish({ id: userId, email });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const handler = new ChangePasswordHandler(
      { publish: () => {} } as never,
      userRepo,
      sessionRepo,
      prisma,
    );
    await expect(
      handler.execute(
        new ChangePasswordCommand(
          userId,
          { currentPassword: "totally-wrong", newPassword: "irrelevant-123" },
          a.sessionId,
        ),
      ),
    ).rejects.toThrow(InvalidCurrentPasswordError);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.passwordHash).toBe(before.passwordHash);

    const rows = await prisma.session.findMany({
      where: { id: { in: [a.sessionId, b.sessionId] } },
    });
    expect(rows.every((r) => r.closedAt === null)).toBe(true);
  });
});
