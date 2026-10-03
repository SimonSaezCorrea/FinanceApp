import { describe, expect, it, vi } from "vitest";

import { GetMeQueryHandler } from "../../../../../../src/domains/user/application/queries/get-me.handler";
import { GetMeQuery } from "../../../../../../src/domains/user/application/queries/get-me.query";
import { UnauthorizedError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";

function fakeRecoveryCodeRepo(remaining = 0): MfaRecoveryCodeRepositoryPort {
  return {
    createManyWithTx: vi.fn(),
    countUnused: vi.fn().mockResolvedValue(remaining),
    findUnusedByUser: vi.fn(),
    markUsedWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn(),
  };
}

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ana Bravo",
    passwordHash: "hashed",
    status: "ACTIVE",
    deletedAt: null,
    preferredCurrency: "CLP",
    locale: "es",
    theme: "dark",
    createdAt: new Date("2022-11-01T00:00:00Z"),
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

describe("GetMeQueryHandler", () => {
  it("returns the user's contract shape", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new GetMeQueryHandler(repo, fakeRecoveryCodeRepo());
    const result = await handler.execute(new GetMeQuery("u1"));
    expect(result.memberSinceYear).toBe(2022);
    expect(result.preferredCurrency).toBe("CLP");
  });

  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new GetMeQueryHandler(repo, fakeRecoveryCodeRepo());
    await expect(handler.execute(new GetMeQuery("gone"))).rejects.toThrow(UnauthorizedError);
  });

  it("reports the real recovery-code count when MFA is enabled", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ mfaEnabled: true }))),
    });
    const handler = new GetMeQueryHandler(repo, fakeRecoveryCodeRepo(7));
    const result = await handler.execute(new GetMeQuery("u1"));
    expect(result.mfaEnabled).toBe(true);
    expect(result.mfaRecoveryCodesRemaining).toBe(7);
  });
});
