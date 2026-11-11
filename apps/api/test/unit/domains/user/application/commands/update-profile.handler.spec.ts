import { describe, expect, it, vi } from "vitest";

import { UpdateProfileHandler } from "../../../../../../src/domains/user/application/commands/update-profile.handler";
import { UpdateProfileCommand } from "../../../../../../src/domains/user/application/commands/update-profile.command";
import {
  IdentifierRequiredError,
  StepUpRequiredError,
  UnauthorizedError,
} from "../../../../../../src/domains/user/domain/errors";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import type { SessionStepUpPort } from "../../../../../../src/domains/session/domain/ports/session-step-up.port";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";

function fakeRecoveryCodeRepo(
  overrides: Partial<MfaRecoveryCodeRepositoryPort> = {},
): MfaRecoveryCodeRepositoryPort {
  return {
    createManyWithTx: vi.fn(),
    countUnused: vi.fn().mockResolvedValue(0),
    findUnusedByUser: vi.fn(),
    markUsedWithTx: vi.fn(),
    deleteAllForUserWithTx: vi.fn(),
    ...overrides,
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
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    saveFields: vi.fn().mockResolvedValue(undefined),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn().mockResolvedValue(null),
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function stepUp(at: Date | null): SessionStepUpPort {
  return { steppedUpAt: vi.fn().mockResolvedValue(at) } as unknown as SessionStepUpPort;
}

function build(repo: UserRepositoryPort, opts: { at?: Date | null; publish?: () => void } = {}) {
  return new UpdateProfileHandler(
    { publish: opts.publish ?? vi.fn() } as never,
    repo,
    fakeRecoveryCodeRepo(),
    stepUp(opts.at === undefined ? null : opts.at),
  );
}

const withRut = () =>
  fakeRepo({
    findById: vi
      .fn()
      .mockResolvedValue(
        User.fromPersistence(baseProps({ identifierType: "RUT", identifierValue: "123456785" })),
      ),
  });

describe("UpdateProfileHandler", () => {
  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    await expect(
      build(repo).execute(new UpdateProfileCommand("gone", { name: "X" }, "s1")),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("never changes the email: that goes through the pending-change flow (specs/032)", async () => {
    const repo = fakeRepo();
    const result = await build(repo).execute(
      new UpdateProfileCommand("u1", { name: "Nuevo" }, "s1"),
    );
    expect(result.name).toBe("Nuevo");
    expect(result.email).toBe(baseProps().email);
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  it("resolves the linked country's name when countryId is set", async () => {
    const repo = fakeRepo({ countryName: vi.fn().mockResolvedValue("Chile") });
    const result = await build(repo).execute(
      new UpdateProfileCommand("u1", { countryId: "cl" }, "s1"),
    );
    expect(result.countryId).toBe("cl");
    expect(result.countryName).toBe("Chile");
  });

  it("writes only the profile columns, never the security state (run-2)", async () => {
    const repo = fakeRepo();
    await build(repo).execute(new UpdateProfileCommand("u1", { name: "New Name" }, "s1"));
    expect(repo.save).not.toHaveBeenCalled();
    const fields = vi.mocked(repo.saveFields).mock.calls[0]![1];
    expect(fields).toContain("name");
    expect(fields).not.toContain("mfaFailedAttempts");
    expect(fields).not.toContain("loginLockedUntil");
  });

  it("refuses to change the RUT without a recent step-up (run-2)", async () => {
    const repo = withRut();
    await expect(
      build(repo).execute(
        new UpdateProfileCommand("u1", { identifierValue: "11.111.111-1" }, "s1"),
      ),
    ).rejects.toThrow(StepUpRequiredError);
    expect(repo.saveFields).not.toHaveBeenCalled();
  });

  it("changes the RUT after a step-up and sends a notice", async () => {
    const repo = withRut();
    const publish = vi.fn();
    await build(repo, { at: new Date(), publish }).execute(
      new UpdateProfileCommand("u1", { identifierValue: "111111111" }, "s1"),
    );
    expect(repo.saveFields).toHaveBeenCalled();
    const event = publish.mock.calls[0]![0] as AccountSecurityEvent;
    expect(event.kind).toBe("IDENTIFIER_CHANGED");
  });

  it("re-sending the same RUT in another format needs no step-up", async () => {
    const repo = withRut();
    const publish = vi.fn();
    await build(repo, { publish }).execute(
      new UpdateProfileCommand(
        "u1",
        { identifierType: "RUT", identifierValue: "12.345.678-5" },
        "s1",
      ),
    );
    expect(repo.saveFields).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("never clears the RUT, even after a step-up", async () => {
    const repo = withRut();
    await expect(
      build(repo, { at: new Date() }).execute(
        new UpdateProfileCommand("u1", { identifierValue: null }, "s1"),
      ),
    ).rejects.toThrow(IdentifierRequiredError);
  });
});
