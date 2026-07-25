import { describe, expect, it, vi } from "vitest";

import { RefreshTokenHandler } from "../../../../../../src/domains/auth/application/commands/refresh-token.handler";
import { RefreshTokenCommand } from "../../../../../../src/domains/auth/application/commands/refresh-token.command";
import { TokenIssuer } from "../../../../../../src/domains/auth/application/token-issuer";
import { AccountDisabledError, InvalidRefreshTokenError, NoRefreshTokenError } from "../../../../../../src/domains/auth/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/auth/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/auth/domain/ports/user.repository.port";

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: null,
    passwordHash: "hashed",
    status: "ACTIVE",
    preferredCurrency: "CLP",
    locale: "es",
    dateFormat: "DD/MM/YYYY",
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
    monthlyBudgetTarget: null,
    billingCycleStartDay: null,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    countryName: vi.fn(),
    ...overrides,
  };
}

describe("RefreshTokenHandler", () => {
  it("rejects a missing refresh token", async () => {
    const tokenIssuer = { issue: vi.fn(), verifyRefresh: vi.fn() } as unknown as TokenIssuer;
    const handler = new RefreshTokenHandler({ publish: vi.fn() } as never, fakeRepo(), tokenIssuer);
    await expect(handler.execute(new RefreshTokenCommand(undefined))).rejects.toThrow(NoRefreshTokenError);
  });

  it("rejects an invalid/expired refresh token", async () => {
    const tokenIssuer = {
      issue: vi.fn(),
      verifyRefresh: vi.fn().mockImplementation(() => {
        throw new Error("bad token");
      }),
    } as unknown as TokenIssuer;
    const handler = new RefreshTokenHandler({ publish: vi.fn() } as never, fakeRepo(), tokenIssuer);
    await expect(handler.execute(new RefreshTokenCommand("bogus"))).rejects.toThrow(InvalidRefreshTokenError);
  });

  it("issues a fresh token pair for a valid token", async () => {
    const tokenIssuer = {
      issue: vi.fn().mockReturnValue({ accessToken: "at2", refreshToken: "rt2" }),
      verifyRefresh: vi.fn().mockReturnValue({ sub: "u1" }),
    } as unknown as TokenIssuer;
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())) });
    const handler = new RefreshTokenHandler({ publish: vi.fn() } as never, repo, tokenIssuer);

    const result = await handler.execute(new RefreshTokenCommand("valid-token"));
    expect(result).toEqual({ accessToken: "at2", refreshToken: "rt2" });
  });

  it("rejects a DISABLED account even with a structurally valid refresh token", async () => {
    const tokenIssuer = {
      issue: vi.fn(),
      verifyRefresh: vi.fn().mockReturnValue({ sub: "u1" }),
    } as unknown as TokenIssuer;
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ status: "DISABLED" }))) });
    const handler = new RefreshTokenHandler({ publish: vi.fn() } as never, repo, tokenIssuer);

    await expect(handler.execute(new RefreshTokenCommand("valid-token"))).rejects.toThrow(AccountDisabledError);
  });
});
