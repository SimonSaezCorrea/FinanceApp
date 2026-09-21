import { describe, expect, it, vi } from "vitest";

import { UpdatePreferencesHandler } from "../../../../../../src/domains/user/application/commands/update-preferences.handler";
import { UpdatePreferencesCommand } from "../../../../../../src/domains/user/application/commands/update-preferences.command";
import { CurrencyInUseError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { CurrencyUsageLookupPort } from "../../../../../../src/domains/bank-account/domain/ports/currency-usage-lookup.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";

function fakeRecoveryCodeRepo(): MfaRecoveryCodeRepositoryPort {
  return {
    createManyWithTx: vi.fn(),
    countUnused: vi.fn().mockResolvedValue(0),
    findUnusedByUser: vi.fn(),
    markUsedWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn(),
  };
}

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
    extraCurrencies: ["USD"],
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
    findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A port stub whose `isCurrencyInUse` always answers `inUse` for every call. */
function fakePort(inUse: boolean): CurrencyUsageLookupPort {
  return { isCurrencyInUse: vi.fn().mockResolvedValue(inUse) };
}

function makeHandler(repo: UserRepositoryPort, ports: { anyInUse: boolean }) {
  const eight = Array.from({ length: 8 }, () => fakePort(ports.anyInUse));
  return new UpdatePreferencesHandler(
    { publish: vi.fn() } as never,
    repo,
    ...(eight as [
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
    ]),
    fakeRecoveryCodeRepo(),
  );
}

describe("UpdatePreferencesHandler", () => {
  it("adding a currency never checks usage and always saves", async () => {
    const repo = fakeRepo();
    const handler = makeHandler(repo, { anyInUse: true });

    const result = await handler.execute(
      new UpdatePreferencesCommand("u1", { extraCurrencies: ["USD", "EUR"] }),
    );

    expect(result.extraCurrencies).toEqual(["USD", "EUR"]);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it("removing a currency nothing uses is accepted", async () => {
    const repo = fakeRepo();
    const handler = makeHandler(repo, { anyInUse: false });

    const result = await handler.execute(
      new UpdatePreferencesCommand("u1", { extraCurrencies: [] }),
    );

    expect(result.extraCurrencies).toEqual([]);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it("removing a currency still in use is rejected and never saved", async () => {
    const repo = fakeRepo();
    const handler = makeHandler(repo, { anyInUse: true });

    await expect(
      handler.execute(new UpdatePreferencesCommand("u1", { extraCurrencies: [] })),
    ).rejects.toThrow(CurrencyInUseError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("removing several currencies at once rejects the whole patch if any one is in use", async () => {
    const repo = fakeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ extraCurrencies: ["USD", "EUR"] }))),
    });
    // Only ONE of the 8 ports reports USD as in use — still enough to reject the whole patch.
    const bankAccountPort: CurrencyUsageLookupPort = {
      isCurrencyInUse: vi
        .fn()
        .mockImplementation((_userId: string, currency: string) =>
          Promise.resolve(currency === "USD"),
        ),
    };
    const restPorts = Array.from({ length: 7 }, () => fakePort(false)) as [
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
      CurrencyUsageLookupPort,
    ];
    const handler = new UpdatePreferencesHandler(
      { publish: vi.fn() } as never,
      repo,
      bankAccountPort,
      ...restPorts,
      fakeRecoveryCodeRepo(),
    );

    await expect(
      handler.execute(new UpdatePreferencesCommand("u1", { extraCurrencies: [] })),
    ).rejects.toThrow(CurrencyInUseError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("a patch that doesn't touch extraCurrencies never checks usage", async () => {
    const repo = fakeRepo();
    const handler = makeHandler(repo, { anyInUse: true });

    const result = await handler.execute(
      new UpdatePreferencesCommand("u1", { hideBalances: true }),
    );

    expect(result.hideBalances).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
});
