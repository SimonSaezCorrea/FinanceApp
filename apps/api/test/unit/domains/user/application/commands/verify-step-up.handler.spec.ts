import { hash } from "bcryptjs";
import * as OTPAuth from "otpauth";
import { describe, expect, it, vi } from "vitest";

import { VerifyStepUpHandler } from "../../../../../../src/domains/user/application/commands/verify-step-up.handler";
import { VerifyStepUpCommand } from "../../../../../../src/domains/user/application/commands/verify-step-up.command";
import {
  InvalidCurrentPasswordError,
  InvalidMfaCodeError,
  StepUpMethodNotAllowedError,
} from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { SessionStepUpPort } from "../../../../../../src/domains/session/domain/ports/session-step-up.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

const SECRET = "JBSWY3DPEHPK3PXP";

function props(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: null,
    passwordHash: null,
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

function setup(userProps: UserProps, passkeyCount = 0) {
  const users: UserRepositoryPort = {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(User.fromPersistence(userProps)),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn().mockResolvedValue(undefined),
    // Each lock re-reads a fresh copy, like the real row lock would.
    findByIdForUpdateWithTx: vi.fn(async () => User.fromPersistence({ ...userProps })),
    countryName: vi.fn(),
    findByIdentifierValue: vi.fn(),
    deleteWithTx: vi.fn(),
  };
  const passkeys = {
    findByUserId: vi.fn().mockResolvedValue(Array.from({ length: passkeyCount }, () => ({}))),
  } as unknown as PasskeyRepositoryPort;
  const stepUp: SessionStepUpPort = { markSteppedUp: vi.fn(), steppedUpAt: vi.fn() };
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as unknown as PrismaService;
  const handler = new VerifyStepUpHandler(
    { publish: vi.fn() } as never,
    users,
    passkeys,
    stepUp,
    prisma,
  );
  return { handler, users, stepUp };
}

const currentTotp = () =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(SECRET) }).generate();

describe("VerifyStepUpHandler", () => {
  it("accepts the password when the user has no second factor, and stamps the session", async () => {
    const { handler, stepUp } = setup(props({ passwordHash: await hash("secret123", 4) }));

    const result = await handler.execute(
      new VerifyStepUpCommand("u1", "sess", { method: "password", password: "secret123" }),
    );

    expect(stepUp.markSteppedUp).toHaveBeenCalledWith("u1", "sess", expect.any(Date));
    const minutesLeft = (new Date(result.verifiedUntil).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(4.9);
    expect(minutesLeft).toBeLessThanOrEqual(5);
  });

  it("rejects a wrong password without stamping", async () => {
    const { handler, stepUp } = setup(props({ passwordHash: await hash("secret123", 4) }));

    await expect(
      handler.execute(new VerifyStepUpCommand("u1", "sess", { method: "password", password: "x" })),
    ).rejects.toThrow(InvalidCurrentPasswordError);
    expect(stepUp.markSteppedUp).not.toHaveBeenCalled();
  });

  it("refuses the password alone when the user has TOTP", async () => {
    const { handler } = setup(
      props({ passwordHash: await hash("secret123", 4), mfaEnabled: true, mfaSecret: SECRET }),
    );

    await expect(
      handler.execute(
        new VerifyStepUpCommand("u1", "sess", { method: "password", password: "secret123" }),
      ),
    ).rejects.toThrow(StepUpMethodNotAllowedError);
  });

  it("refuses the password alone when the user has a passkey", async () => {
    const { handler } = setup(props({ passwordHash: await hash("secret123", 4) }), 1);

    await expect(
      handler.execute(
        new VerifyStepUpCommand("u1", "sess", { method: "password", password: "secret123" }),
      ),
    ).rejects.toThrow(StepUpMethodNotAllowedError);
  });

  it("accepts a valid TOTP code", async () => {
    const { handler, stepUp } = setup(props({ mfaEnabled: true, mfaSecret: SECRET }));

    await handler.execute(
      new VerifyStepUpCommand("u1", "sess", { method: "totp", code: currentTotp() }),
    );

    expect(stepUp.markSteppedUp).toHaveBeenCalled();
  });

  it("counts a wrong TOTP code toward the shared lockout", async () => {
    const { handler, users, stepUp } = setup(props({ mfaEnabled: true, mfaSecret: SECRET }));

    await expect(
      handler.execute(new VerifyStepUpCommand("u1", "sess", { method: "totp", code: "000000" })),
    ).rejects.toThrow(InvalidMfaCodeError);
    const saved = vi.mocked(users.saveWithTx).mock.calls[0]?.[1] as User;
    expect(saved.mfaFailedAttempts).toBe(1);
    expect(stepUp.markSteppedUp).not.toHaveBeenCalled();
  });
});
