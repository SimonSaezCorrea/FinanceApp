import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { LoginHandler } from "../../../../../../src/domains/user/application/commands/login.handler";
import { LoginCommand } from "../../../../../../src/domains/user/application/commands/login.command";
import { SessionIssuer } from "../../../../../../src/domains/user/application/session-issuer";
import { TokenIssuer } from "../../../../../../src/domains/user/application/token-issuer";
import {
  AccountDisabledError,
  InvalidCredentialsError,
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
    deletedAt: null,
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
    identifierType: "RUT",
    identifierValue: "123456785",
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
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeTokenIssuer(): TokenIssuer {
  return {
    issue: vi.fn().mockReturnValue({ accessToken: "at", refreshToken: "rt", sessionId: "s1" }),
    verifyRefresh: vi.fn(),
    issueMfaPending: vi.fn().mockReturnValue("pending-token"),
    verifyMfaPending: vi.fn(),
  } as unknown as TokenIssuer;
}

function fakeSessionIssuer(): SessionIssuer {
  return {
    establish: vi.fn().mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      sessionId: "s1",
      sessionExpiresAt: new Date("2024-01-08T00:00:00Z"),
    }),
  } as unknown as SessionIssuer;
}

describe("LoginHandler", () => {
  it("accepts a correct password and issues tokens", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({
      findByIdentifierValue: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const handler = new LoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeTokenIssuer(),
      fakeSessionIssuer(),
    );

    const result = await handler.execute(
      new LoginCommand({ identifierValue: "12.345.678-5", password: "secret123" }),
    );
    if (result.mfaRequired) throw new Error("expected a full session, got mfaRequired");
    expect(result.user.email).toBe("a@b.com");
    expect(result.tokens.accessToken).toBe("at");
    // Normalized (dots/dash stripped) before the lookup.
    expect(repo.findByIdentifierValue).toHaveBeenCalledWith("123456785");
  });

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({
      findByIdentifierValue: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const handler = new LoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeTokenIssuer(),
      fakeSessionIssuer(),
    );

    await expect(
      handler.execute(new LoginCommand({ identifierValue: "123456785", password: "wrong" })),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects an unknown RUT with INVALID_CREDENTIALS (no user-enumeration)", async () => {
    const repo = fakeRepo({ findByIdentifierValue: vi.fn().mockResolvedValue(null) });
    const handler = new LoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeTokenIssuer(),
      fakeSessionIssuer(),
    );

    await expect(
      handler.execute(new LoginCommand({ identifierValue: "999999990", password: "whatever" })),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects a DISABLED account with ACCOUNT_DISABLED even with the correct password", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({
      findByIdentifierValue: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ passwordHash, status: "DISABLED" }))),
    });
    const handler = new LoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeTokenIssuer(),
      fakeSessionIssuer(),
    );

    await expect(
      handler.execute(new LoginCommand({ identifierValue: "123456785", password: "secret123" })),
    ).rejects.toThrow(AccountDisabledError);
  });

  it("does not issue a session for a user with MFA active — only a pending token", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({
      findByIdentifierValue: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ passwordHash, mfaEnabled: true }))),
    });
    const tokenIssuer = fakeTokenIssuer();
    const sessionIssuer = fakeSessionIssuer();
    const handler = new LoginHandler(
      { publish: vi.fn() } as never,
      repo,
      tokenIssuer,
      sessionIssuer,
    );

    const result = await handler.execute(
      new LoginCommand({ identifierValue: "123456785", password: "secret123" }),
    );
    if (!result.mfaRequired) throw new Error("expected mfaRequired, got a full session");
    expect(result.mfaPendingToken).toBe("pending-token");
    expect(tokenIssuer.issue).not.toHaveBeenCalled();
    expect(sessionIssuer.establish).not.toHaveBeenCalled();
  });

  it("a user without MFA logs in exactly as before (regression)", async () => {
    const passwordHash = await hash("secret123", 1);
    const repo = fakeRepo({
      findByIdentifierValue: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ passwordHash, mfaEnabled: false }))),
    });
    const handler = new LoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeTokenIssuer(),
      fakeSessionIssuer(),
    );

    const result = await handler.execute(
      new LoginCommand({ identifierValue: "123456785", password: "secret123" }),
    );
    if (result.mfaRequired) throw new Error("expected a full session, got mfaRequired");
    expect(result.user.email).toBe("a@b.com");
    expect(result.tokens.accessToken).toBe("at");
  });
});
