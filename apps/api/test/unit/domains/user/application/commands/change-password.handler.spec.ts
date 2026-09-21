import { compare, hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { ChangePasswordHandler } from "../../../../../../src/domains/user/application/commands/change-password.handler";
import { ChangePasswordCommand } from "../../../../../../src/domains/user/application/commands/change-password.command";
import { InvalidCurrentPasswordError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
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

function fakeSessions(overrides: Partial<SessionRepositoryPort> = {}): SessionRepositoryPort {
  return {
    create: vi.fn(),
    listByUser: vi.fn(),
    touch: vi.fn(),
    closeOwned: vi.fn(),
    existsForUser: vi.fn(),
    closeAllExceptForUser: vi.fn(),
    closeAllExceptForUserWithTx: vi.fn().mockResolvedValue(1),
    closeById: vi.fn(),
    markExpiredAsClosed: vi.fn(),
    purgeClosedBefore: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakePrisma(): PrismaService {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
  } as unknown as PrismaService;
}

describe("ChangePasswordHandler", () => {
  it("rejects an incorrect current password and never saves", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const sessions = fakeSessions();
    const handler = new ChangePasswordHandler(
      { publish: vi.fn() } as never,
      repo,
      sessions,
      fakePrisma(),
    );

    await expect(
      handler.execute(
        new ChangePasswordCommand(
          "u1",
          { currentPassword: "wrong", newPassword: "newpassword123" },
          "session-a",
        ),
      ),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(repo.saveWithTx).not.toHaveBeenCalled();
    expect(sessions.closeAllExceptForUserWithTx).not.toHaveBeenCalled();
  });

  it("persists a new hash when the current password is correct", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const sessions = fakeSessions();
    const handler = new ChangePasswordHandler(
      { publish: vi.fn() } as never,
      repo,
      sessions,
      fakePrisma(),
    );

    await handler.execute(
      new ChangePasswordCommand(
        "u1",
        { currentPassword: "correct-pw", newPassword: "newpassword123" },
        "session-a",
      ),
    );

    expect(repo.saveWithTx).toHaveBeenCalledTimes(1);
    const saved = (repo.saveWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![1] as User;
    expect(saved.passwordHash).not.toBe(passwordHash);
    expect(await compare("newpassword123", saved.passwordHash!)).toBe(true);
  });

  it("closes every other session (never its own) inside the same transaction as the password change", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const sessions = fakeSessions();
    const handler = new ChangePasswordHandler(
      { publish: vi.fn() } as never,
      repo,
      sessions,
      fakePrisma(),
    );

    await handler.execute(
      new ChangePasswordCommand(
        "u1",
        { currentPassword: "correct-pw", newPassword: "newpassword123" },
        "session-a",
      ),
    );

    expect(sessions.closeAllExceptForUserWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "session-a",
    );
  });

  it("rolls back the password change when closing the other sessions fails", async () => {
    const passwordHash = await hash("correct-pw", 1);
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ passwordHash }))),
    });
    const sessions = fakeSessions({
      closeAllExceptForUserWithTx: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    } as unknown as PrismaService;
    const handler = new ChangePasswordHandler(
      { publish: vi.fn() } as never,
      repo,
      sessions,
      prisma,
    );

    await expect(
      handler.execute(
        new ChangePasswordCommand(
          "u1",
          { currentPassword: "correct-pw", newPassword: "newpassword123" },
          "session-a",
        ),
      ),
    ).rejects.toThrow("db down");
    // Both writes happen inside the SAME $transaction callback — a real Postgres
    // transaction would roll back `saveWithTx` too when the callback throws; this
    // fake only proves both calls are issued through that one callback (FR-007).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
