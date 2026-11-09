import type { auth } from "@finance/contracts";
import { describe, expect, it, vi } from "vitest";
import { fakeMfaCodes, fakeSessionStepUp } from "../../../../support/fake-ports";

import { StartMfaEnrollmentHandler } from "../../../../../../src/domains/user/application/commands/start-mfa-enrollment.handler";
import { StartMfaEnrollmentCommand } from "../../../../../../src/domains/user/application/commands/start-mfa-enrollment.command";
import {
  MfaEmailNotVerifiedError,
  MfaSameMethodError,
  StepUpRequiredError,
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

describe("StartMfaEnrollmentHandler", () => {
  it("generates a secret, a QR data URL, and saves it without activating MFA", async () => {
    const repo = fakeRepo({
      findById: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = new StartMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeSessionStepUp(),
      fakeMfaCodes(),
    );

    const result = (await handler.execute(
      new StartMfaEnrollmentCommand("u1", {}, "sess"),
    )) as Extract<auth.StartMfaEnrollmentResponse, { secret: string }>;

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
    const handler = new StartMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeSessionStepUp(),
      fakeMfaCodes(),
    );

    const result = (await handler.execute(
      new StartMfaEnrollmentCommand("u1", {}, "sess"),
    )) as Extract<auth.StartMfaEnrollmentResponse, { secret: string }>;

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
    const handler = new StartMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeSessionStepUp(),
      fakeMfaCodes(),
    );

    await expect(handler.execute(new StartMfaEnrollmentCommand("u1", {}, "sess"))).rejects.toThrow(
      MfaSameMethodError,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when the user no longer exists", async () => {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const handler = new StartMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeSessionStepUp(),
      fakeMfaCodes(),
    );

    await expect(
      handler.execute(new StartMfaEnrollmentCommand("gone", {}, "sess")),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("StartMfaEnrollmentHandler - email and method change (specs/040 US3)", () => {
  function setup(props: UserProps, stepUpAge: number | null = 0) {
    const repo = fakeRepo({ findById: vi.fn().mockResolvedValue(User.fromPersistence(props)) });
    const mfaCodes = fakeMfaCodes();
    const handler = new StartMfaEnrollmentHandler(
      { publish: vi.fn() } as never,
      repo,
      fakeSessionStepUp(stepUpAge),
      mfaCodes,
    );
    return { handler, repo, mfaCodes };
  }
  const verified = { emailVerifiedAt: new Date("2026-01-01T00:00:00Z") };

  it("email: sends an ENROLL code to the confirmed address and saves the pending method", async () => {
    const { handler, repo, mfaCodes } = setup(baseProps(verified));
    const result = await handler.execute(
      new StartMfaEnrollmentCommand("u1", { method: "email" }, "sess"),
    );
    expect(result).toEqual({ method: "email", codeSent: true });
    expect(mfaCodes.issueAndSendOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.com", emailVerified: true }),
      "ENROLL",
    );
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as User;
    expect(saved.mfaPendingMethod).toBe("EMAIL");
    expect(saved.mfaEnabled).toBe(false);
  });

  it("email: refuses an unconfirmed address", async () => {
    const { handler } = setup(baseProps());
    await expect(
      handler.execute(new StartMfaEnrollmentCommand("u1", { method: "email" }, "sess")),
    ).rejects.toThrow(MfaEmailNotVerifiedError);
  });

  it("changing an active method needs a recent step-up", async () => {
    const active = baseProps({ ...verified, mfaEnabled: true, mfaMethod: "TOTP", mfaSecret: "X" });
    const stale = setup(active, null);
    await expect(
      stale.handler.execute(new StartMfaEnrollmentCommand("u1", { method: "email" }, "sess")),
    ).rejects.toThrow(StepUpRequiredError);
    expect(stale.mfaCodes.issueAndSendOrThrow).not.toHaveBeenCalled();

    const fresh = setup(active, 0);
    await expect(
      fresh.handler.execute(new StartMfaEnrollmentCommand("u1", { method: "email" }, "sess")),
    ).resolves.toEqual({ method: "email", codeSent: true });
  });

  it("the FIRST enrolment also needs a recent step-up (GHSA-jhp2-jfjr-fqfq)", async () => {
    const stale = setup(baseProps(verified), null);
    await expect(
      stale.handler.execute(new StartMfaEnrollmentCommand("u1", {}, "sess")),
    ).rejects.toThrow(StepUpRequiredError);
    expect(stale.repo.save).not.toHaveBeenCalled();

    const noSession = setup(baseProps(verified), 0);
    await expect(noSession.handler.execute(new StartMfaEnrollmentCommand("u1"))).rejects.toThrow(
      StepUpRequiredError,
    );
  });
});
