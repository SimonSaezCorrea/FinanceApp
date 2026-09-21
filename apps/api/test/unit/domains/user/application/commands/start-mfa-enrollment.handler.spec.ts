import { describe, expect, it, vi } from "vitest";

import { StartMfaEnrollmentHandler } from "../../../../../../src/domains/user/application/commands/start-mfa-enrollment.handler";
import { StartMfaEnrollmentCommand } from "../../../../../../src/domains/user/application/commands/start-mfa-enrollment.command";
import {
  MfaAlreadyEnabledError,
  UnauthorizedError,
} from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";

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

describe("StartMfaEnrollmentHandler", () => {
  it("generates a secret, a QR data URL, and saves it without activating MFA", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new StartMfaEnrollmentHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(new StartMfaEnrollmentCommand("u1"));

    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as User;
    expect(saved.mfaEnabled).toBe(false);
    expect(saved.mfaSecret).toBe(result.secret);
  });

  it("replaces a previous unconfirmed pending secret with a fresh one", async () => {
    const repo = fakeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(User.fromPersistence(baseProps({ mfaSecret: "OLDSECRETXXXXXXX" }))),
    });
    const handler = new StartMfaEnrollmentHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(new StartMfaEnrollmentCommand("u1"));

    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as User;
    expect(saved.mfaSecret).not.toBe("OLDSECRETXXXXXXX");
    expect(saved.mfaSecret).toBe(result.secret);
  });

  it("rejects when MFA is already active — no replace-device path", async () => {
    const repo = fakeRepo({
      findById: vi
        .fn()
        .mockResolvedValue(
          User.fromPersistence(baseProps({ mfaEnabled: true, mfaSecret: "ACTIVESECRETXXXX" })),
        ),
    });
    const handler = new StartMfaEnrollmentHandler({ publish: vi.fn() } as never, repo);

    await expect(handler.execute(new StartMfaEnrollmentCommand("u1"))).rejects.toThrow(
      MfaAlreadyEnabledError,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new StartMfaEnrollmentHandler({ publish: vi.fn() } as never, repo);

    await expect(handler.execute(new StartMfaEnrollmentCommand("gone"))).rejects.toThrow(
      UnauthorizedError,
    );
  });
});
