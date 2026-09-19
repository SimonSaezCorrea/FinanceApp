import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...actual, verifyAuthenticationResponse: vi.fn() };
});

import { verifyAuthenticationResponse } from "@simplewebauthn/server";

import { VerifyPasskeyLoginHandler } from "../../../../../src/domains/user/application/commands/verify-passkey-login.handler";
import { VerifyPasskeyLoginCommand } from "../../../../../src/domains/user/application/commands/verify-passkey-login.command";
import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import { buildUserRepo } from "../../../support/repositories";
import { PrismaPasskeyRepository } from "../../../../../src/domains/passkey/infrastructure/prisma-passkey.repository";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("Passkey login (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const userRepo = buildUserRepo(prisma);
  const passkeyRepo = new PrismaPasskeyRepository(prisma);
  const email = `int_passkey_login_${randomUUID()}@test.local`;
  const config = new ConfigService({
    CORS_ORIGIN: "http://localhost:5173",
    JWT_ACCESS_SECRET: "test",
    JWT_REFRESH_SECRET: "test2",
  });
  const tokenIssuer = new TokenIssuer(new JwtService(), config);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const sessionIssuer = new SessionIssuer(tokenIssuer, sessionRepo, new GeoIpLookup(config));
  let userId: string;
  let passkeyId: string;
  const credentialId = `cred_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({ email, name: "Passkey Login Test", passwordHash: "x" });
    userId = user.id;
    const row = await prisma.passkey.create({
      data: {
        userId,
        name: "Integration Key",
        credentialId,
        publicKey: "AQID",
        counter: 3,
      },
    });
    passkeyId = row.id;
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("updates counter and lastUsedAt on a verified login", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 4 },
    } as never);

    const handler = new VerifyPasskeyLoginHandler(
      { publish: () => {} } as never,
      userRepo,
      passkeyRepo,
      sessionIssuer,
      config,
      prisma,
    );

    const result = await handler.execute(
      new VerifyPasskeyLoginCommand({ id: credentialId }, "any-challenge", userId, false),
    );

    expect(result.user.email).toBe(email);
    const row = await prisma.passkey.findUniqueOrThrow({ where: { id: passkeyId } });
    expect(row.counter).toBe(4);
    expect(row.lastUsedAt).not.toBeNull();
  });
});
