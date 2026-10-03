import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CloseSessionHandler } from "../../../../../src/domains/user/application/commands/close-session.handler";
import { CloseSessionCommand } from "../../../../../src/domains/user/application/commands/close-session.command";
import { RefreshTokenHandler } from "../../../../../src/domains/user/application/commands/refresh-token.handler";
import { RefreshTokenCommand } from "../../../../../src/domains/user/application/commands/refresh-token.command";
import { GeoIpLookup } from "../../../../../src/domains/user/application/geoip-lookup";
import { SessionIssuer } from "../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../src/domains/user/application/token-issuer";
import {
  InvalidRefreshTokenError,
  SessionNotFoundError,
  StepUpRequiredError,
} from "../../../../../src/domains/user/domain/errors";
import { buildUserRepo, noopIpGeolocationCacheRepo } from "../../../support/repositories";
import { PrismaSessionRepository } from "../../../../../src/domains/session/infrastructure/prisma-session.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("CloseSessionHandler (integration)", () => {
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
  const email = `int_close_session_${randomUUID()}@test.local`;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await userRepo.create({
      email,
      name: "Close Session Test",
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

  it("closing a session stamps closedAt (row survives) and its refresh token can no longer be used", async () => {
    const tokens = await sessionIssuer.establish({ id: userId, email });

    const closeHandler = new CloseSessionHandler(
      { publish: () => {} } as never,
      sessionRepo,
      sessionRepo,
    );
    // Closing your own session is signing out — no step-up involved.
    await closeHandler.execute(new CloseSessionCommand(userId, tokens.sessionId, tokens.sessionId));

    const row = await prisma.session.findUniqueOrThrow({ where: { id: tokens.sessionId } });
    expect(row.closedAt).not.toBeNull();

    const refreshHandler = new RefreshTokenHandler(
      { publish: () => {} } as never,
      userRepo,
      tokenIssuer,
      sessionIssuer,
    );
    await expect(
      refreshHandler.execute(new RefreshTokenCommand(tokens.refreshToken)),
    ).rejects.toThrow(InvalidRefreshTokenError);
  });

  it("throws SESSION_NOT_FOUND for a session that isn't the caller's own", async () => {
    const tokens = await sessionIssuer.establish({ id: userId, email });
    const closeHandler = new CloseSessionHandler(
      { publish: () => {} } as never,
      sessionRepo,
      sessionRepo,
    );

    await expect(
      closeHandler.execute(
        new CloseSessionCommand("someone-else", tokens.sessionId, tokens.sessionId),
      ),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it("closing ANOTHER session needs a recent step-up stamped on the caller's own session", async () => {
    const mine = await sessionIssuer.establish({ id: userId, email });
    const other = await sessionIssuer.establish({ id: userId, email });
    const closeHandler = new CloseSessionHandler(
      { publish: () => {} } as never,
      sessionRepo,
      sessionRepo,
    );

    await expect(
      closeHandler.execute(new CloseSessionCommand(userId, other.sessionId, mine.sessionId)),
    ).rejects.toThrow(StepUpRequiredError);
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: other.sessionId } })).closedAt,
    ).toBeNull();

    // A step-up on the OTHER session never unlocks this one — it's bound to the session.
    await sessionRepo.markSteppedUp(userId, other.sessionId, new Date());
    await expect(
      closeHandler.execute(new CloseSessionCommand(userId, other.sessionId, mine.sessionId)),
    ).rejects.toThrow(StepUpRequiredError);

    await sessionRepo.markSteppedUp(userId, mine.sessionId, new Date());
    await closeHandler.execute(new CloseSessionCommand(userId, other.sessionId, mine.sessionId));
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: other.sessionId } })).closedAt,
    ).not.toBeNull();
  });
});
