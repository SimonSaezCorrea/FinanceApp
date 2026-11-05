import { describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";
import { fakeMfaCodes, fakeTrustedDevices } from "../../../../support/fake-ports";

import { ConfirmMfaEnrollmentHandler } from "../../../../../../src/domains/user/application/commands/confirm-mfa-enrollment.handler";
import { ConfirmMfaEnrollmentCommand } from "../../../../../../src/domains/user/application/commands/confirm-mfa-enrollment.command";
import {
  InvalidMfaCodeError,
  MfaAlreadyEnabledError,
  MfaNotPendingError,
} from "../../../../../../src/domains/user/domain/errors";
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
    loginFailedAttempts: 0,
    loginLockedUntil: null,
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
    createManyWithTx: vi.fn().mockResolvedValue(undefined),
    countUnused: vi.fn().mockResolvedValue(0),
    findUnusedByUser: vi.fn(),
    markUsedWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn(),
    ...overrides,
  };
}

function fakePrisma(): PrismaService {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
  } as unknown as PrismaService;
}

const SECRET = "JBSWY3DPEHPK3PXP";

function validCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

describe("ConfirmMfaEnrollmentHandler", () => {
  it("activates MFA and creates 10 hashed recovery codes on a valid code", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ mfaSecret: SECRET }))),
    });
    const recoveryCodes = fakeRecoveryCodeRepo();
    const handler = new ConfirmMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      recoveryCodes,
      fakePrisma(),
      fakeTrustedDevices(),
      fakeMfaCodes(),
    );

    const result = await handler.execute(
      new ConfirmMfaEnrollmentCommand("u1", { code: validCodeFor(SECRET) }),
    );

    expect(result.recoveryCodes).toHaveLength(10);
    expect(new Set(result.recoveryCodes).size).toBe(10);
    expect(repo.saveWithTx).toHaveBeenCalledTimes(1);
    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.mfaEnabled).toBe(true);
    expect(recoveryCodes.createManyWithTx).toHaveBeenCalledTimes(1);
    const hashes = (recoveryCodes.createManyWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(hashes).toHaveLength(10);
  });

  it("rejects an invalid code and does not activate MFA", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ mfaSecret: SECRET }))),
    });
    const handler = new ConfirmMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakePrisma(),
      fakeTrustedDevices(),
      fakeMfaCodes(),
    );

    await expect(
      handler.execute(new ConfirmMfaEnrollmentCommand("u1", { code: "000000" })),
    ).rejects.toThrow(InvalidMfaCodeError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("rejects when there is no pending enrollment to confirm", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new ConfirmMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakePrisma(),
      fakeTrustedDevices(),
      fakeMfaCodes(),
    );

    await expect(
      handler.execute(new ConfirmMfaEnrollmentCommand("u1", { code: "123456" })),
    ).rejects.toThrow(MfaNotPendingError);
  });

  it("rejects when MFA is already active, before evaluating any code", async () => {
    const repo = fakeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(
          User.fromPersistence(baseProps({ mfaEnabled: true, mfaSecret: SECRET })),
        ),
    });
    const handler = new ConfirmMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeRecoveryCodeRepo(),
      fakePrisma(),
      fakeTrustedDevices(),
      fakeMfaCodes(),
    );

    await expect(
      handler.execute(new ConfirmMfaEnrollmentCommand("u1", { code: "000000" })),
    ).rejects.toThrow(MfaAlreadyEnabledError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });
});

describe("ConfirmMfaEnrollmentHandler - email and method change (specs/040 US3)", () => {
  function setup(props: UserProps, codeOk: boolean) {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(props)) });
    const recoveryCodes = fakeRecoveryCodeRepo();
    const devices = fakeTrustedDevices();
    const mfaCodes = fakeMfaCodes({ verifyWithTx: vi.fn().mockResolvedValue(codeOk) });
    const publish = vi.fn();
    const handler = new ConfirmMfaEnrollmentHandler(
      { publish } as never,
      repo,
      recoveryCodes,
      fakePrisma(),
      devices,
      mfaCodes,
    );
    return { handler, repo, recoveryCodes, devices, publish };
  }

  it("activates email codes with the ENROLL code, issuing recovery codes", async () => {
    const { handler, recoveryCodes } = setup(baseProps({ mfaPendingMethod: "EMAIL" }), true);
    const result = await handler.execute(new ConfirmMfaEnrollmentCommand("u1", { code: "123456" }));
    expect(result.recoveryCodes).toHaveLength(10);
    expect(recoveryCodes.createManyWithTx).toHaveBeenCalled();
  });

  it("a wrong ENROLL code activates nothing", async () => {
    const { handler, repo } = setup(baseProps({ mfaPendingMethod: "EMAIL" }), false);
    await expect(
      handler.execute(new ConfirmMfaEnrollmentCommand("u1", { code: "000000" })),
    ).rejects.toThrow(InvalidMfaCodeError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("a method change keeps the recovery codes, drops the TOTP secret, forgets devices and notifies", async () => {
    const { handler, repo, recoveryCodes, devices, publish } = setup(
      baseProps({
        mfaEnabled: true,
        mfaMethod: "TOTP",
        mfaSecret: SECRET,
        mfaPendingMethod: "EMAIL",
      }),
      true,
    );
    const result = await handler.execute(new ConfirmMfaEnrollmentCommand("u1", { code: "123456" }));
    expect(result.recoveryCodes).toBeNull();
    expect(recoveryCodes.createManyWithTx).not.toHaveBeenCalled();
    expect(devices.deleteAllForUserWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.mfaMethodOrDefault()).toBe("EMAIL");
    expect(saved.mfaSecret).toBeNull();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ kind: "MFA_METHOD_CHANGED" }));
  });
});
