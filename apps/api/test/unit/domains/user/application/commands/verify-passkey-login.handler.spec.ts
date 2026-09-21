import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", () => ({
  verifyAuthenticationResponse: vi.fn(),
}));

import { verifyAuthenticationResponse } from "@simplewebauthn/server";

import { VerifyPasskeyLoginHandler } from "../../../../../../src/domains/user/application/commands/verify-passkey-login.handler";
import { VerifyPasskeyLoginCommand } from "../../../../../../src/domains/user/application/commands/verify-passkey-login.command";
import { SessionIssuer } from "../../../../../../src/domains/user/application/session-issuer";
import { InvalidCredentialsError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

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
    identifierType: null,
    identifierValue: null,
    phone: null,
    hideBalances: false,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    mfaEnabled: true, // deliberately active — must be bypassed entirely (FR-007)
    mfaSecret: "JBSWY3DPEHPK3PXP",
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const STORED_PASSKEY = {
  id: "p1",
  userId: "u1",
  name: "Key",
  credentialId: "cred1",
  publicKey: "AQID", // base64url for [1,2,3]
  counter: 5,
  transports: [],
  createdAt: "2024-01-01T00:00:00Z",
  lastUsedAt: null,
};

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(),
    findByUserId: vi.fn(),
    findByCredentialId: vi.fn().mockResolvedValue(STORED_PASSKEY),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn().mockResolvedValue(undefined),
    deleteOwned: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

function fakeSessionIssuer(): SessionIssuer {
  return {
    establish: vi
      .fn()
      .mockResolvedValue({ accessToken: "at", refreshToken: "rt", sessionId: "s1" }),
  } as unknown as SessionIssuer;
}

function config(): ConfigService {
  return new ConfigService({ CORS_ORIGIN: "http://localhost:5173" });
}

function fakePrisma(): PrismaService {
  return {} as unknown as PrismaService;
}

describe("VerifyPasskeyLoginHandler", () => {
  beforeEach(() => {
    vi.mocked(verifyAuthenticationResponse).mockReset();
  });

  it("issues a full session on a verified response, bypassing MFA entirely", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    } as never);
    const repo = fakeRepo();
    const passkeys = fakePasskeys();
    const sessionIssuer = fakeSessionIssuer();
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      passkeys,
      sessionIssuer,
      config(),
      fakePrisma(),
    );

    const result = await handler.execute(
      new VerifyPasskeyLoginCommand({ id: "cred1" }, "challenge", "u1", false),
    );

    expect(result.tokens.accessToken).toBe("at");
    expect(passkeys.updateCounterAndLastUsedWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      6,
      expect.any(Date),
    );
  });

  it("rejects with INVALID_CREDENTIALS when userId is null (email had no passkeys)", async () => {
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      fakePasskeys(),
      fakeSessionIssuer(),
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyPasskeyLoginCommand({ id: "cred1" }, "challenge", null, false)),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("discoverable login (no pre-resolved userId) resolves the account from the credential itself", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    } as never);
    const repo = fakeRepo();
    const passkeys = fakePasskeys();
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      passkeys,
      fakeSessionIssuer(),
      config(),
      fakePrisma(),
    );

    const result = await handler.execute(
      new VerifyPasskeyLoginCommand({ id: "cred1" }, "challenge", null, true),
    );

    expect(result.tokens.accessToken).toBe("at");
    expect(repo.findById).toHaveBeenCalledWith(STORED_PASSKEY.userId);
  });

  it("discoverable login still rejects generically when the credential doesn't exist", async () => {
    const passkeys = fakePasskeys({ findByCredentialId: vi.fn().mockResolvedValue(null) });
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      passkeys,
      fakeSessionIssuer(),
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyPasskeyLoginCommand({ id: "unknown" }, "challenge", null, true)),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("rejects with INVALID_CREDENTIALS when the credential belongs to a different user", async () => {
    const passkeys = fakePasskeys({
      findByCredentialId: vi.fn().mockResolvedValue({ ...STORED_PASSKEY, userId: "someone-else" }),
    });
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      passkeys,
      fakeSessionIssuer(),
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyPasskeyLoginCommand({ id: "cred1" }, "challenge", "u1", false)),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects with INVALID_CREDENTIALS when verification fails (never a distinct code)", async () => {
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: false } as never);
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      fakePasskeys(),
      fakeSessionIssuer(),
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyPasskeyLoginCommand({ id: "cred1" }, "challenge", "u1", false)),
    ).rejects.toThrow(InvalidCredentialsError);
    expect(fakePasskeys().updateCounterAndLastUsedWithTx).not.toHaveBeenCalled();
  });

  it("rejects with INVALID_CREDENTIALS when the library throws (e.g. counter regression)", async () => {
    vi.mocked(verifyAuthenticationResponse).mockRejectedValue(new Error("counter went backward"));
    const handler = new VerifyPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      fakeRepo(),
      fakePasskeys(),
      fakeSessionIssuer(),
      config(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyPasskeyLoginCommand({ id: "cred1" }, "challenge", "u1", false)),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});
