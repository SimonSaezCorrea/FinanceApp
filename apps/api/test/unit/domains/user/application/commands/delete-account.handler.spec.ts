import { hash } from "bcryptjs";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { DeleteAccountHandler } from "../../../../../../src/domains/user/application/commands/delete-account.handler";
import { DeleteAccountCommand } from "../../../../../../src/domains/user/application/commands/delete-account.command";
import {
  InvalidCurrentPasswordError,
  LoginLockedError,
  StepUpRequiredError,
} from "../../../../../../src/domains/user/domain/errors";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import { UserAccountDeletedEvent } from "../../../../../../src/domains/user/domain/events/user-account-deleted.event";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { AccountDeletionLogRepositoryPort } from "../../../../../../src/domains/account-deletion-log/domain/ports/account-deletion-log.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import type { ConfigService } from "@nestjs/config";
import { resetFailureCounters } from "../../../../../../src/domains/user/application/failure-counter";

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
  const repo: UserRepositoryPort = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    saveFields: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  // The locked read returns what `findById` returns unless a test says otherwise.
  if (!overrides.findByIdForUpdateWithTx) {
    repo.findByIdForUpdateWithTx = vi.fn((_tx: unknown, id: string) => repo.findById(id));
  }
  return repo;
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
    stepUp?: unknown;
    passkeyCount?: number;
  } = {},
) {
  return new DeleteAccountHandler(
    { publish: overrides.publish ?? vi.fn() } as never,
    overrides.repo ?? fakeRepo(),
    overrides.deletionLog ?? fakeDeletionLog(),
    fakeConfig(),
    overrides.prisma ?? fakePrisma(),
    (overrides.stepUp ?? {
      steppedUpAt: vi.fn().mockResolvedValue(null),
      markSteppedUp: vi.fn(),
      consumeWithTx: vi.fn().mockResolvedValue(true),
    }) as never,
    { countUsable: vi.fn().mockResolvedValue(overrides.passkeyCount ?? 0) } as never,
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
  beforeEach(() => resetFailureCounters());

  it("rejects an incorrect password and changes nothing", async () => {
    const repo = await userWithPassword();
    const handler = buildHandler({ repo });

    await expect(
      handler.execute(new DeleteAccountCommand("u1", { password: "wrong" }, "session-a")),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    // Counted in memory (security run-3), never on the account row: nothing is written.
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(repo.deleteWithTx).not.toHaveBeenCalled();
  });

  it("deletes the User row itself (the cascade takes everything else), never scrubs-and-saves it", async () => {
    const repo = await userWithPassword();
    const prisma = fakePrisma();
    const handler = buildHandler({ repo, prisma });

    await handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a"));

    // The password check runs no transaction of its own (counted in memory, security run-3).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(repo.deleteWithTx).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(repo.saveWithTx).not.toHaveBeenCalled();
  });

  it("ignores a deprecated keepHistory=true from an old client: still deletes everything", async () => {
    const repo = await userWithPassword();
    const deletionLog = fakeDeletionLog();
    const handler = buildHandler({ repo, deletionLog });

    await handler.execute(
      new DeleteAccountCommand("u1", { password: "correct-pw", keepHistory: true }, "session-a"),
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

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a"),
      );

      expect(deletionLog.createWithTx).toHaveBeenCalledWith(expect.anything(), false, null);
    });

    it("hashes the identifier (never the raw RUT) when one was set", async () => {
      const repo = await userWithPassword({
        identifierType: "RUT",
        identifierValue: "11.111.111-1",
      });
      const deletionLog = fakeDeletionLog();
      const handler = buildHandler({ repo, deletionLog });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a"),
      );

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

    await handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a"));

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
      handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a")),
    ).rejects.toThrow("db down");
    expect(deletionLog.createWithTx).not.toHaveBeenCalled();
  });

  describe("with a second factor or a passkey (security run-3)", () => {
    const stepUpAt = (at: Date | null) => ({
      steppedUpAt: vi.fn().mockResolvedValue(at),
      markSteppedUp: vi.fn(),
      consumeWithTx: vi.fn().mockResolvedValue(true),
    });

    it("refuses an MFA account whose session has no recent step-up, before checking the password", async () => {
      const repo = await userWithPassword({ mfaEnabled: true });
      const handler = buildHandler({ repo, stepUp: stepUpAt(null) });

      await expect(
        handler.execute(new DeleteAccountCommand("u1", { password: "wrong" }, "session-a")),
      ).rejects.toThrow(StepUpRequiredError);
      expect(repo.deleteWithTx).not.toHaveBeenCalled();
    });

    it("refuses an account with a passkey and no step-up", async () => {
      const repo = await userWithPassword();
      const handler = buildHandler({ repo, stepUp: stepUpAt(null), passkeyCount: 1 });

      await expect(
        handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a")),
      ).rejects.toThrow(StepUpRequiredError);
      expect(repo.deleteWithTx).not.toHaveBeenCalled();
    });

    it("deletes with a recent step-up and spends it in the same transaction", async () => {
      const repo = await userWithPassword({ mfaEnabled: true });
      const at = new Date();
      const stepUp = stepUpAt(at);
      const handler = buildHandler({ repo, stepUp });

      await handler.execute(
        new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a"),
      );
      expect(stepUp.consumeWithTx).toHaveBeenCalledWith({}, "u1", "session-a", at);
      expect(repo.deleteWithTx).toHaveBeenCalledTimes(1);
    });

    it("refuses when the step-up was already spent by a concurrent request", async () => {
      const repo = await userWithPassword({ mfaEnabled: true });
      const stepUp = stepUpAt(new Date());
      stepUp.consumeWithTx.mockResolvedValue(false);
      const handler = buildHandler({ repo, stepUp });

      await expect(
        handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a")),
      ).rejects.toThrow(StepUpRequiredError);
      expect(repo.deleteWithTx).not.toHaveBeenCalled();
    });
  });

  it("locks the password check after 5 wrong answers, the right one included", async () => {
    const repo = await userWithPassword();
    const handler = buildHandler({ repo });
    for (let i = 0; i < 4; i++) {
      await expect(
        handler.execute(new DeleteAccountCommand("u1", { password: `wrong-${i}` }, "session-a")),
      ).rejects.toThrow(InvalidCurrentPasswordError);
    }
    await expect(
      handler.execute(new DeleteAccountCommand("u1", { password: "wrong-4" }, "session-a")),
    ).rejects.toThrow(LoginLockedError);
    await expect(
      handler.execute(new DeleteAccountCommand("u1", { password: "correct-pw" }, "session-a")),
    ).rejects.toThrow(LoginLockedError);
    expect(repo.deleteWithTx).not.toHaveBeenCalled();
  });
});
