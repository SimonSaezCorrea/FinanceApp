import { describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";

import { VerifyMfaLoginHandler } from "../../../../../../src/domains/user/application/commands/verify-mfa-login.handler";
import { VerifyMfaLoginCommand } from "../../../../../../src/domains/user/application/commands/verify-mfa-login.command";
import { SessionIssuer } from "../../../../../../src/domains/user/application/session-issuer";
import {
  InvalidMfaCodeError,
  MfaLockedError,
  UnauthorizedError,
} from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

const SECRET = "JBSWY3DPEHPK3PXP";

function validCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
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
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    mfaEnabled: true,
    mfaSecret: SECRET,
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
    save: vi.fn().mockResolvedValue(undefined),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeRecoveryCodeRepo(
  overrides: Partial<MfaRecoveryCodeRepositoryPort> = {},
): MfaRecoveryCodeRepositoryPort {
  return {
    createManyWithTx: vi.fn(),
    countUnused: vi.fn().mockResolvedValue(0),
    findUnusedByUser: vi.fn().mockResolvedValue([]),
    markUsedWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn(),
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

function fakePrisma(): PrismaService {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as PrismaService;
}

describe("VerifyMfaLoginHandler", () => {
  it("issues a real session on a valid TOTP code and resets the failure counter", async () => {
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ mfaFailedAttempts: 3 }))),
    });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakeSessionIssuer(),
      fakePrisma(),
    );

    const result = await handler.execute(
      new VerifyMfaLoginCommand("u1", { code: validCodeFor(SECRET) }),
    );

    expect(result.tokens.accessToken).toBe("at");
    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.mfaFailedAttempts).toBe(0);
  });

  it("rejects an invalid code, increments the counter, and grants no session", async () => {
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakeSessionIssuer(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyMfaLoginCommand("u1", { code: "000000" })),
    ).rejects.toThrow(InvalidMfaCodeError);
    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.mfaFailedAttempts).toBe(1);
  });

  it("locks the account on the 5th consecutive invalid code", async () => {
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ mfaFailedAttempts: 4 }))),
    });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakeSessionIssuer(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyMfaLoginCommand("u1", { code: "000000" })),
    ).rejects.toThrow(MfaLockedError);
    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.mfaLockedUntil).not.toBeNull();
  });

  it("rejects every attempt while locked, without even evaluating the code", async () => {
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi
        .fn()
        .mockResolvedValue(
          User.fromPersistence(baseProps({ mfaLockedUntil: new Date(Date.now() + 60_000) })),
        ),
    });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakeSessionIssuer(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyMfaLoginCommand("u1", { code: validCodeFor(SECRET) })),
    ).rejects.toThrow(MfaLockedError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("accepts an unused recovery code and marks it used", async () => {
    const { hash } = await import("bcryptjs");
    const codeHash = await hash("AB3D-9F2K", 4);
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const recoveryCodes = fakeRecoveryCodeRepo({
      findUnusedByUser: vi.fn().mockResolvedValue([{ id: "rc1", codeHash }]),
      markUsedWithTx: vi.fn().mockResolvedValue(true),
    });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      recoveryCodes,
      fakeSessionIssuer(),
      fakePrisma(),
    );

    const result = await handler.execute(new VerifyMfaLoginCommand("u1", { code: "AB3D-9F2K" }));

    expect(result.tokens.accessToken).toBe("at");
    expect(recoveryCodes.markUsedWithTx).toHaveBeenCalledWith(expect.anything(), "rc1");
  });

  it("rejects a recovery code that has already been used (lost the atomic race)", async () => {
    const { hash } = await import("bcryptjs");
    const codeHash = await hash("AB3D-9F2K", 4);
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const recoveryCodes = fakeRecoveryCodeRepo({
      findUnusedByUser: vi.fn().mockResolvedValue([{ id: "rc1", codeHash }]),
      markUsedWithTx: vi.fn().mockResolvedValue(false), // someone else claimed it first
    });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      recoveryCodes,
      fakeSessionIssuer(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyMfaLoginCommand("u1", { code: "AB3D-9F2K" })),
    ).rejects.toThrow(InvalidMfaCodeError);
  });

  it("rejects an unknown recovery code without an atomic-claim attempt", async () => {
    const repo = fakeRepo({
      findByIdForUpdateWithTx: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const recoveryCodes = fakeRecoveryCodeRepo({ findUnusedByUser: vi.fn().mockResolvedValue([]) });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      recoveryCodes,
      fakeSessionIssuer(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyMfaLoginCommand("u1", { code: "ZZZZ-ZZZZ" })),
    ).rejects.toThrow(InvalidMfaCodeError);
    expect(recoveryCodes.markUsedWithTx).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findByIdForUpdateWithTx: vi.fn().mockResolvedValue(null) });
    const handler = new VerifyMfaLoginHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakeSessionIssuer(),
      fakePrisma(),
    );

    await expect(
      handler.execute(new VerifyMfaLoginCommand("gone", { code: "000000" })),
    ).rejects.toThrow(UnauthorizedError);
  });
});
