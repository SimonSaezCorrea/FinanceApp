import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { DeleteAccountHandler } from "../../../../../../src/domains/user/application/commands/delete-account.handler";
import { DeleteAccountCommand } from "../../../../../../src/domains/user/application/commands/delete-account.command";
import { InvalidCurrentPasswordError } from "../../../../../../src/domains/user/domain/errors";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import { UserAccountDeletedEvent } from "../../../../../../src/domains/user/domain/events/user-account-deleted.event";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
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
    deletionLog?: AccountDeletionLogRepositoryPort;
    prisma?: PrismaService;
    publish?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return new DeleteAccountHandler(
    { publish: overrides.publish ?? vi.fn() } as never,
    overrides.repo ?? fakeRepo(),
    overrides.deletionLog ?? fakeDeletionLog(),
    fakeConfig(),
    overrides.prisma ?? fakePrisma(),
  );
}

async function userWithPassword(overrides: Partial<UserProps> = {}) {
  const passwordHash = await hash("correct-pw", 1);
  return fakeRepo({
    findById: vi
      .fn()
      .mockResolvedValue(User.fromPersistence(baseProps({ passwordHash, ...overrides }))),
  });
}

describe("DeleteAccountHandler", () => {
  it("rejects an incorrect password and changes nothing", async () => {
    const repo = await userWithPassword();
    const handler = buildHandler({ repo });

    await expect(
      handler.execute(new DeleteAccountCommand("u1", { password: "wrong" })),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(repo.deleteWithTx).not.toHaveBeenCalled();
  });

  it("deletes the User row itself (the cascade takes everything else), never scrubs-and-saves it", async () => {
    const repo = await userWithPassword();
    const prisma = fakePrisma();
    const handler = buildHandler({ repo, prisma });

    await handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(repo.deleteWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("ignores a deprecated keepHistory=true from an old client: still deletes everything", async () => {
    const repo = await userWithPassword();
    const deletionLog = fakeDeletionLog();
    const handler = buildHandler({ repo, deletionLog });

    await handler.execute(
      new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }),
    );

    expect(repo.deleteWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(deletionLog.createWithTx).toHaveBeenCalledWith(expect.anything(), false, null);
  });

  describe("account-deletion compliance log", () => {
    it("writes a log row with identifierHash=null when the user had no identifier set", async () => {
      const repo = await userWithPassword({ identifierValue: null });
      const deletionLog = fakeDeletionLog();
      const handler = buildHandler({ repo, deletionLog });

      await handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }));

      expect(deletionLog.createWithTx).toHaveBeenCalledWith(expect.anything(), false, null);
    });

    it("hashes the identifier (never the raw RUT) when one was set", async () => {
      const repo = await userWithPassword({
        identifierType: "RUT",
        identifierValue: "11.111.111-1",
      });
      const deletionLog = fakeDeletionLog();
      const handler = buildHandler({ repo, deletionLog });

      await handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }));

      const [, keepHistoryArg, identifierHash] = (
        deletionLog.createWithTx as ReturnType<typeof vi.fn>
      ).mock.calls[0]!;
      expect(keepHistoryArg).toBe(false);
      expect(identifierHash).not.toBeNull();
      expect(identifierHash).not.toBe("11.111.111-1");
    });
  });

  it("publishes UserAccountDeletedEvent on a genuine deletion", async () => {
    const repo = await userWithPassword();
    const publish = vi.fn();
    const handler = buildHandler({ repo, publish });

    await handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }));

    // The deletion itself, plus the goodbye notice to the address the account had (specs/032).
    const published = publish.mock.calls.map(([e]) => e as object);
    expect(published.some((e) => e instanceof UserAccountDeletedEvent)).toBe(true);
    const notice = published.find((e) => e instanceof AccountSecurityEvent) as AccountSecurityEvent;
    expect(notice.kind).toBe("ACCOUNT_DELETED");
    expect(notice.recipient?.address).toBe(baseProps().email);
  });

  it("rolls back the whole change when deleting the row fails", async () => {
    const repo = await userWithPassword();
    (repo.deleteWithTx as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    const deletionLog = fakeDeletionLog();
    const handler = buildHandler({ repo, deletionLog });

    await expect(
      handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" })),
    ).rejects.toThrow("db down");
    expect(deletionLog.createWithTx).not.toHaveBeenCalled();
  });
});
