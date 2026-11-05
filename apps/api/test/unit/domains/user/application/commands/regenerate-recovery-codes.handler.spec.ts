import { describe, expect, it, vi } from "vitest";

import { RegenerateRecoveryCodesCommand } from "../../../../../../src/domains/user/application/commands/regenerate-recovery-codes.command";
import { RegenerateRecoveryCodesHandler } from "../../../../../../src/domains/user/application/commands/regenerate-recovery-codes.handler";
import {
  MfaNotEnabledError,
  StepUpRequiredError,
} from "../../../../../../src/domains/user/domain/errors";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { MfaRecoveryCodeRepositoryPort } from "../../../../../../src/domains/mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import type { SessionStepUpPort } from "../../../../../../src/domains/session/domain/ports/session-step-up.port";
import type { TrustedDeviceRepositoryPort } from "../../../../../../src/domains/trusted-device/domain/ports/trusted-device.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";

function props(overrides: Partial<UserProps> = {}): UserProps {
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
    mfaMethod: "TOTP",
    mfaSecret: "JBSWY3DPEHPK3PXP",
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    loginFailedAttempts: 0,
    loginLockedUntil: null,
    ...overrides,
  };
}

function setup(opts: { user?: UserProps; steppedUpAt?: Date | null; consumed?: boolean } = {}) {
  const order: string[] = [];
  const users = {
    findById: vi.fn().mockResolvedValue(User.fromPersistence(opts.user ?? props())),
  } as unknown as UserRepositoryPort;
  const recoveryCodes = {
    deleteAllForUserWithTx: vi.fn(async () => void order.push("delete")),
    createManyWithTx: vi.fn(async () => void order.push("create")),
  } as unknown as MfaRecoveryCodeRepositoryPort;
  const steppedUpAt = opts.steppedUpAt === undefined ? new Date() : opts.steppedUpAt;
  const stepUp = {
    steppedUpAt: vi.fn().mockResolvedValue(steppedUpAt),
    markSteppedUp: vi.fn(),
    consumeWithTx: vi.fn(async () => {
      order.push("consume");
      return opts.consumed ?? true;
    }),
  } as unknown as SessionStepUpPort;
  const devices = {
    deleteAllForUserWithTx: vi.fn(async () => void order.push("forget-devices")),
  } as unknown as TrustedDeviceRepositoryPort;
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn("tx")),
  } as unknown as PrismaService;
  const publish = vi.fn();
  const handler = new RegenerateRecoveryCodesHandler(
    { publish } as never,
    users,
    recoveryCodes,
    stepUp,
    devices,
    prisma,
  );
  return { handler, order, recoveryCodes, stepUp, publish, users };
}

describe("RegenerateRecoveryCodesHandler (specs/040 US1)", () => {
  it("returns 10 new codes, replacing the old set after spending the step-up, in one transaction", async () => {
    const { handler, order, recoveryCodes, publish } = setup();

    const result = await handler.execute(new RegenerateRecoveryCodesCommand("u1", "s1"));

    expect(result.recoveryCodes).toHaveLength(10);
    expect(new Set(result.recoveryCodes).size).toBe(10);
    expect(order).toEqual(["consume", "delete", "create", "forget-devices"]);
    const hashes = (recoveryCodes.createManyWithTx as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(hashes).toHaveLength(10);
    expect(hashes).not.toContain(result.recoveryCodes[0]);
    const event = publish.mock.calls[0]![0] as AccountSecurityEvent;
    expect(event.kind).toBe("RECOVERY_CODES_REGENERATED");
  });

  it("requires a recent step-up", async () => {
    const { handler, order } = setup({ steppedUpAt: null });
    await expect(handler.execute(new RegenerateRecoveryCodesCommand("u1", "s1"))).rejects.toThrow(
      StepUpRequiredError,
    );
    const stale = setup({ steppedUpAt: new Date(Date.now() - 6 * 60_000) });
    await expect(
      stale.handler.execute(new RegenerateRecoveryCodesCommand("u1", "s1")),
    ).rejects.toThrow(StepUpRequiredError);
    expect(order).toEqual([]);
  });

  it("refuses a replay: a step-up already spent writes nothing", async () => {
    const { handler, order, publish } = setup({ consumed: false });
    await expect(handler.execute(new RegenerateRecoveryCodesCommand("u1", "s1"))).rejects.toThrow(
      StepUpRequiredError,
    );
    expect(order).toEqual(["consume"]);
    expect(publish).not.toHaveBeenCalled();
  });

  it("refuses without MFA active", async () => {
    const { handler } = setup({ user: props({ mfaEnabled: false, mfaMethod: null }) });
    await expect(handler.execute(new RegenerateRecoveryCodesCommand("u1", "s1"))).rejects.toThrow(
      MfaNotEnabledError,
    );
  });
});
