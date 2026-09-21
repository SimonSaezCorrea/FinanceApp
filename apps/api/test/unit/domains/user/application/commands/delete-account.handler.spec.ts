import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { DeleteAccountHandler } from "../../../../../../src/domains/user/application/commands/delete-account.handler";
import { DeleteAccountCommand } from "../../../../../../src/domains/user/application/commands/delete-account.command";
import { InvalidCurrentPasswordError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import type { AccountDeletionLogRepositoryPort } from "../../../../../../src/domains/account-deletion-log/domain/ports/account-deletion-log.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import type { ConfigService } from "@nestjs/config";

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
    phone: "+56911111111",
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
    save: vi.fn().mockResolvedValue(undefined),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeSessions(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn(),
    listByUser: vi.fn(),
    touch: vi.fn(),
    closeOwned: vi.fn(),
    existsForUser: vi.fn(),
    closeAllExceptForUser: vi.fn(),
    closeAllExceptForUserWithTx: vi.fn(),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(),
    findByUserId: vi.fn(),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    renameOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeRecoveryCodes(
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

function fakeDeletionLog(
  overrides: Partial<AccountDeletionLogRepositoryPort> = {},
): AccountDeletionLogRepositoryPort {
  return {
    createWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeConfig(): ConfigService {
  return { getOrThrow: vi.fn().mockReturnValue("test-hmac-secret") } as unknown as ConfigService;
}

function fakePrisma(): PrismaService {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
  } as unknown as PrismaService;
}

function buildHandler(
  overrides: {
    repo?: UserRepositoryPort;
    sessions?: SessionRepositoryPort;
    passkeys?: PasskeyRepositoryPort;
    recoveryCodes?: MfaRecoveryCodeRepositoryPort;
    deletionLog?: AccountDeletionLogRepositoryPort;
    prisma?: PrismaService;
  } = {},
) {
  return new DeleteAccountHandler(
    { publish: vi.fn() } as never,
    overrides.repo ?? fakeRepo(),
    overrides.sessions ?? fakeSessions(),
    overrides.passkeys ?? fakePasskeys(),
    overrides.recoveryCodes ?? fakeRecoveryCodes(),
    overrides.deletionLog ?? fakeDeletionLog(),
    fakeConfig(),
    overrides.prisma ?? fakePrisma(),
  );
}

describe("DeleteAccountHandler", () => {
  it("rejects an incorrect password and changes nothing", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const handler = buildHandler({ repo });

    await expect(
      handler.execute(new DeleteAccountCommand("u1", { password: "wrong", keepHistory: false })),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(repo.deleteWithTx).not.toHaveBeenCalled();
  });

  describe("keepHistory=false (hard delete)", () => {
    it("deletes the User row itself, never scrubs-and-saves it", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const repo = fakeRepo({
        findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
      });
      const handler = buildHandler({ repo });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: false }),
      );

      expect(repo.deleteWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
      expect(repo.saveWithTx).not.toHaveBeenCalled();
    });

    it("never calls the security-artifact ports directly — cascade handles them", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const repo = fakeRepo({
        findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
      });
      const sessions = fakeSessions();
      const passkeys = fakePasskeys();
      const recoveryCodes = fakeRecoveryCodes();
      const handler = buildHandler({ repo, sessions, passkeys, recoveryCodes });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: false }),
      );

      expect(sessions.deleteAllForUserWithTx).not.toHaveBeenCalled();
      expect(passkeys.deleteAllForUserWithTx).not.toHaveBeenCalled();
      expect(recoveryCodes.deleteAllForUserWithTx).not.toHaveBeenCalled();
    });
  });

  describe("keepHistory=true (anonymize)", () => {
    it("scrubs every PII field and sets status=DISABLED, keeping only id/createdAt", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const repo = fakeRepo({
        findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
      });
      const handler = buildHandler({ repo });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }),
      );

      const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
      expect(saved.status).toBe("DISABLED");
      expect(saved.name).toBeNull();
      expect(saved.email).toBeNull();
      expect(saved.passwordHash).toBeNull();
      expect(saved.id).toBe("u1");
      expect(repo.deleteWithTx).not.toHaveBeenCalled();
    });

    it("still hard-deletes sessions, passkeys and recovery codes — they only let someone log back in", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const repo = fakeRepo({
        findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
      });
      const sessions = fakeSessions();
      const passkeys = fakePasskeys();
      const recoveryCodes = fakeRecoveryCodes();
      const handler = buildHandler({ repo, sessions, passkeys, recoveryCodes });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }),
      );

      expect(sessions.deleteAllForUserWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
      expect(passkeys.deleteAllForUserWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
      expect(recoveryCodes.deleteAllForUserWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
    });
  });

  describe("account-deletion compliance log", () => {
    it("writes a log row with identifierHash=null when the user had no identifier set", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const repo = fakeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(
            User.fromPersistence(baseProps({ passwordHash, identifierValue: null })),
          ),
      });
      const deletionLog = fakeDeletionLog();
      const handler = buildHandler({ repo, deletionLog });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: false }),
      );

      expect(deletionLog.createWithTx).toHaveBeenCalledWith(expect.anything(), false, null);
    });

    it("hashes the identifier (never the raw RUT) when one was set", async () => {
      const passwordHash = await hash("correct-pw", 1);
      const repo = fakeRepo({
        findById: vi
          .fn()
          .mockResolvedValue(
            User.fromPersistence(
              baseProps({ passwordHash, identifierType: "RUT", identifierValue: "11.111.111-1" }),
            ),
          ),
      });
      const deletionLog = fakeDeletionLog();
      const handler = buildHandler({ repo, deletionLog });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }),
      );

      const [, keepHistoryArg, identifierHash] = (
        deletionLog.createWithTx as ReturnType<typeof vi.fn>
      ).mock.calls[0]!;
      expect(keepHistoryArg).toBe(true);
      expect(identifierHash).not.toBeNull();
      expect(identifierHash).not.toBe("11.111.111-1");
    });
  });

  it("publishes UserAccountDeletedEvent on a genuine deletion", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const publish = vi.fn();
    const handler = new DeleteAccountHandler(
      { publish } as never,
      repo,
      fakeSessions(),
      fakePasskeys(),
      fakeRecoveryCodes(),
      fakeDeletionLog(),
      fakeConfig(),
      fakePrisma(),
    );

    await handler.execute(
      new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("rolls back the whole change when hard-deleting sessions fails (keepHistory=true)", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const sessions = fakeSessions({
      deleteAllForUserWithTx: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const prisma = fakePrisma();
    const handler = buildHandler({ repo, sessions, prisma });

    await expect(
      handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }),
      ),
    ).rejects.toThrow("db down");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
