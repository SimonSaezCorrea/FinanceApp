import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { DisableMfaHandler } from "../../../../../../src/domains/user/application/commands/disable-mfa.handler";
import { DisableMfaCommand } from "../../../../../../src/domains/user/application/commands/disable-mfa.command";
import { InvalidCurrentPasswordError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

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
    mfaEnabled: true,
    mfaSecret: "JBSWY3DPEHPK3PXP",
    mfaFailedAttempts: 2,
    mfaLockedUntil: null,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    ...overrides,
  };
}

function fakeRecoveryCodeRepo(
  overrides: Partial<MfaRecoveryCodeRepositoryPort> = {},
): MfaRecoveryCodeRepositoryPort {
  return {
    createManyWithTx: vi.fn(),
    countUnused: vi.fn(),
    findUnusedByUser: vi.fn(),
    markUsedWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakePrisma(): PrismaService {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
  } as unknown as PrismaService;
}

describe("DisableMfaHandler", () => {
  it("disables MFA and discards recovery codes when the password is correct", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const recoveryCodes = fakeRecoveryCodeRepo();
    const handler = new DisableMfaHandler(
      { publish: vi.fn() } as never,
      repo,
      recoveryCodes,
      fakePrisma(),
    );

    await handler.execute(new DisableMfaCommand("u1", { password: "correct-pw" }));

    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.mfaEnabled).toBe(false);
    expect(saved.mfaSecret).toBeNull();
    expect(saved.mfaFailedAttempts).toBe(0);
    expect(recoveryCodes.deleteAllForUserWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
  });

  it("rejects an incorrect password and changes nothing", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const recoveryCodes = fakeRecoveryCodeRepo();
    const handler = new DisableMfaHandler(
      { publish: vi.fn() } as never,
      repo,
      recoveryCodes,
      fakePrisma(),
    );

    await expect(
      handler.execute(new DisableMfaCommand("u1", { password: "wrong" })),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(recoveryCodes.deleteAllForUserWithTx).not.toHaveBeenCalled();
  });
});
