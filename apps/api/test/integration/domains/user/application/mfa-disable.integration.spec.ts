import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DisableMfaHandler } from "../../../../../src/domains/user/application/commands/disable-mfa.handler";
import { DisableMfaCommand } from "../../../../../src/domains/user/application/commands/disable-mfa.command";
import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { buildMfaRecoveryCodeRepo, buildUserRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("MFA disable (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const recoveryCodeRepo = buildMfaRecoveryCodeRepo(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const config = new ConfigService({
    JWT_ACCESS_SECRET: "test-access",
    JWT_REFRESH_SECRET: "test-refresh",
  });
  const tokenIssuer = new TokenIssuer(new JwtService(), config);
  const sessionIssuer = new SessionIssuer(tokenIssuer, sessionRepo, new GeoIpLookup(config));
  const email = `int_mfadisable_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const passwordHash = await hash("correct-pw", 4);
    const user = await prisma.user.create({
      data: {
        email,
        name: "Disable Test",
        passwordHash,
        mfaEnabled: true,
        mfaSecretEncrypted: null,
      },
    });
    userId = user.id;
    await prisma.mfaRecoveryCode.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ userId, codeHash: `hash-${i}` })),
    });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("clears MFA state and deletes every recovery code row atomically", async () => {
    const a = await sessionIssuer.establish({ id: userId, email });
    const handler = new DisableMfaHandler(
      { publish: () => {} } as never,
      userRepo,
      recoveryCodeRepo,
      sessionRepo,
      prisma,
    );
    await handler.execute(new DisableMfaCommand(userId, { password: "correct-pw" }, a.sessionId));

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.mfaEnabled).toBe(false);
    expect(row.mfaSecretEncrypted).toBeNull();

    const remaining = await prisma.mfaRecoveryCode.count({ where: { userId } });
    expect(remaining).toBe(0);
  });

  it("disabling MFA from one of 3 real sessions closes the other two, keeps that one open", async () => {
    // Re-enable MFA for a fresh scenario (the previous test already disabled it).
    await prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await prisma.mfaRecoveryCode.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ userId, codeHash: `hash2-${i}` })),
    });

    const a = await sessionIssuer.establish({ id: userId, email });
    const b = await sessionIssuer.establish({ id: userId, email });
    const c = await sessionIssuer.establish({ id: userId, email });

    const handler = new DisableMfaHandler(
      { publish: () => {} } as never,
      userRepo,
      recoveryCodeRepo,
      sessionRepo,
      prisma,
    );
    await handler.execute(new DisableMfaCommand(userId, { password: "correct-pw" }, a.sessionId));

    const rows = await prisma.session.findMany({
      where: { id: { in: [a.sessionId, b.sessionId, c.sessionId] } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a.sessionId)?.closedAt).toBeNull();
    expect(byId.get(b.sessionId)?.closedAt).not.toBeNull();
    expect(byId.get(c.sessionId)?.closedAt).not.toBeNull();
  });
});
