import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { StartPasskeyLoginHandler } from "../../../../../../src/domains/user/application/commands/start-passkey-login.handler";
import { StartPasskeyLoginCommand } from "../../../../../../src/domains/user/application/commands/start-passkey-login.command";
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

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue([]),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

function config(): ConfigService {
  return new ConfigService({ CORS_ORIGIN: "http://localhost:5173" });
}

describe("StartPasskeyLoginHandler", () => {
  it("resolves a real userId and allowCredentials when the RUT has passkeys", async () => {
    const repo = fakeRepo({
      findByIdentifierValue: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const passkeys = fakePasskeys({
      findByUserId: vi.fn().mockResolvedValue([
        {
          id: "p1",
          userId: "u1",
          name: "Key",
          credentialId: "cred1",
          publicKey: "pk",
          counter: 0,
          transports: [],
          createdAt: "x",
          lastUsedAt: null,
        },
      ]),
    });
    const handler = new StartPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      passkeys,
      config(),
    );

    const result = await handler.execute(new StartPasskeyLoginCommand("12345678-5"));

    expect(result.userId).toBe("u1");
    const options = result.options as { allowCredentials?: { id: string }[] };
    expect(options.allowCredentials?.[0]?.id).toBe("cred1");
  });

  it("returns the SAME shape (empty allowCredentials, userId null) for an unknown RUT", async () => {
    const repo = fakeRepo({ findByIdentifierValue: vi.fn().mockResolvedValue(null) });
    const handler = new StartPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakePasskeys(),
      config(),
    );

    const result = await handler.execute(new StartPasskeyLoginCommand("99999999-9"));

    expect(result.userId).toBeNull();
    const options = result.options as { allowCredentials?: unknown[] };
    expect(options.allowCredentials).toEqual([]);
  });

  it("returns the SAME shape for a known RUT with zero passkeys", async () => {
    const repo = fakeRepo({
      findByIdentifierValue: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new StartPasskeyLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakePasskeys({ findByUserId: vi.fn().mockResolvedValue([]) }),
      config(),
    );

    const result = await handler.execute(new StartPasskeyLoginCommand("12345678-5"));

    expect(result.userId).toBeNull();
    const options = result.options as { allowCredentials?: unknown[] };
    expect(options.allowCredentials).toEqual([]);
  });
});
