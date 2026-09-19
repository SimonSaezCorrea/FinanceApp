import { describe, expect, it, vi } from "vitest";

import { RefreshTokenHandler } from "../../../../../../src/domains/user/application/commands/refresh-token.handler";
import { RefreshTokenCommand } from "../../../../../../src/domains/user/application/commands/refresh-token.command";
import { SessionIssuer } from "../../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../../src/domains/user/application/token-issuer";
import {
  AccountDisabledError,
  InvalidRefreshTokenError,
  NoRefreshTokenError,
} from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: null,
    passwordHash: "hashed",
    status: "ACTIVE",
    preferredCurrency: "CLP",
    locale: "es",
    theme: "dark",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    countryId: null,
    countryName: null,
    addressStreet: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    birthDate: null,
    identifierType: null,
    identifierValue: null,
    phone: null,
    hideBalances: false,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    mfaEnabled: false,
    mfaSecret: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    ...overrides,
  };
}

function fakeSessionIssuer(overrides: Partial<SessionIssuer> = {}): SessionIssuer {
  return {
    establish: vi
      .fn()
      .mockResolvedValue({ accessToken: "at2", refreshToken: "rt2", sessionId: "s1" }),
    ...overrides,
  } as unknown as SessionIssuer;
}

describe("RefreshTokenHandler", () => {
  it("rejects a missing refresh token", async () => {
    const tokenIssuer = { issue: vi.fn(), verifyRefresh: vi.fn() } as unknown as TokenIssuer;
    const handler = new RefreshTokenHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      tokenIssuer,
      fakeSessionIssuer(),
    );
    await expect(handler.execute(new RefreshTokenCommand(undefined))).rejects.toThrow(
      NoRefreshTokenError,
    );
  });

  it("rejects an invalid/expired refresh token", async () => {
    const tokenIssuer = {
      issue: vi.fn(),
      verifyRefresh: vi.fn().mockImplementation(() => {
        throw new Error("bad token");
      }),
    } as unknown as TokenIssuer;
    const handler = new RefreshTokenHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      tokenIssuer,
      fakeSessionIssuer(),
    );
    await expect(handler.execute(new RefreshTokenCommand("bogus"))).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it("issues a fresh token pair for a valid token, reusing the same session id", async () => {
    const tokenIssuer = {
      issue: vi.fn(),
      verifyRefresh: vi.fn().mockReturnValue({ sub: "u1", sid: "s1" }),
    } as unknown as TokenIssuer;
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const sessionIssuer = fakeSessionIssuer();
    const handler = new RefreshTokenHandler(
      { publish: vi.fn() } as never,
      repo,
      tokenIssuer,
      sessionIssuer,
    );

    const result = await handler.execute(new RefreshTokenCommand("valid-token"));
    expect(result).toEqual({ accessToken: "at2", refreshToken: "rt2", sessionId: "s1" });
    expect(sessionIssuer.establish).toHaveBeenCalledWith(
      { id: "u1", email: "a@b.com" },
      { reuseSessionId: "s1" },
    );
  });

  it("propagates InvalidRefreshTokenError when the session behind the token no longer exists", async () => {
    const tokenIssuer = {
      issue: vi.fn(),
      verifyRefresh: vi.fn().mockReturnValue({ sub: "u1", sid: "closed-session" }),
    } as unknown as TokenIssuer;
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const sessionIssuer = fakeSessionIssuer({
      establish: vi.fn().mockRejectedValue(new InvalidRefreshTokenError()),
    });
    const handler = new RefreshTokenHandler(
      { publish: vi.fn() } as never,
      repo,
      tokenIssuer,
      sessionIssuer,
    );

    await expect(handler.execute(new RefreshTokenCommand("valid-token"))).rejects.toThrow(
      InvalidRefreshTokenError,
    );
  });

  it("rejects a DISABLED account even with a structurally valid refresh token", async () => {
    const tokenIssuer = {
      issue: vi.fn(),
      verifyRefresh: vi.fn().mockReturnValue({ sub: "u1", sid: "s1" }),
    } as unknown as TokenIssuer;
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ status: "DISABLED" }))),
    });
    const handler = new RefreshTokenHandler(
      { publish: vi.fn() } as never,
      repo,
      tokenIssuer,
      fakeSessionIssuer(),
    );

    await expect(handler.execute(new RefreshTokenCommand("valid-token"))).rejects.toThrow(
      AccountDisabledError,
    );
  });
});
