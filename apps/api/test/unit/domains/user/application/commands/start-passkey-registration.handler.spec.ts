import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { StartPasskeyRegistrationHandler } from "../../../../../../src/domains/user/application/commands/start-passkey-registration.handler";
import { StartPasskeyRegistrationCommand } from "../../../../../../src/domains/user/application/commands/start-passkey-registration.command";
import { UnauthorizedError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";

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

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue([]),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

function config(): ConfigService {
  return new ConfigService({ CORS_ORIGIN: "http://localhost:5173" });
}

describe("StartPasskeyRegistrationHandler", () => {
  it("generates registration options excluding already-registered credentials", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const passkeys = fakePasskeys({
      findByUserId: vi.fn().mockResolvedValue([
        {
          id: "p1",
          userId: "u1",
          name: "Old",
          credentialId: "cred1",
          publicKey: "pk",
          counter: 0,
          transports: [],
          createdAt: "2024-01-01",
          lastUsedAt: null,
        },
      ]),
    });
    const handler = new StartPasskeyRegistrationHandler(
      { publish: vi.fn() } as never,
      repo,
      passkeys,
      config(),
    );

    const result = await handler.execute(new StartPasskeyRegistrationCommand("u1"));

    expect(result.options).toBeDefined();
    const options = result.options as { excludeCredentials?: { id: string }[]; rp: { id: string } };
    expect(options.excludeCredentials?.[0]?.id).toBe("cred1");
    expect(options.rp.id).toBe("localhost");
  });

  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new StartPasskeyRegistrationHandler(
      { publish: vi.fn() } as never,
      repo,
      fakePasskeys(),
      config(),
    );

    await expect(handler.execute(new StartPasskeyRegistrationCommand("gone"))).rejects.toThrow(
      UnauthorizedError,
    );
  });
});
