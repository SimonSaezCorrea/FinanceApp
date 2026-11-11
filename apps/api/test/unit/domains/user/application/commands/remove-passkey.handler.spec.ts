import { describe, expect, it, vi } from "vitest";

import { RemovePasskeyHandler } from "../../../../../../src/domains/user/application/commands/remove-passkey.handler";
import { RemovePasskeyCommand } from "../../../../../../src/domains/user/application/commands/remove-passkey.command";
import {
  PasskeyNotFoundError,
  StepUpRequiredError,
} from "../../../../../../src/domains/user/domain/errors";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";
import type { SessionRepositoryPort } from "../../../../../../src/domains/session/domain/ports/session.repository.port";
import type { SessionStepUpPort } from "../../../../../../src/domains/session/domain/ports/session-step-up.port";

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(),
    findByUserId: vi.fn(),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    countUsable: vi.fn().mockResolvedValue(0),
    markCompromisedWithTx: vi.fn().mockResolvedValue([]),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

function fakeSessions(): SessionRepositoryPort {
  return {
    closeByPasskeysWithTx: vi.fn().mockResolvedValue(1),
    closeOnCompromisedPasskeysWithTx: vi.fn().mockResolvedValue(0),
  } as unknown as SessionRepositoryPort;
}

function steppedUp(at: Date | null = new Date()): SessionStepUpPort {
  return {
    markSteppedUp: vi.fn(),
    steppedUpAt: vi.fn().mockResolvedValue(at),
  } as unknown as SessionStepUpPort;
}

const TX = { tx: true };
const prisma = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(TX)) };

function build(
  passkeys: PasskeyRepositoryPort,
  opts: { sessions?: SessionRepositoryPort; stepUp?: SessionStepUpPort; publish?: () => void } = {},
) {
  return new RemovePasskeyHandler(
    { publish: opts.publish ?? vi.fn() } as never,
    passkeys,
    opts.sessions ?? fakeSessions(),
    opts.stepUp ?? steppedUp(),
    prisma as never,
  );
}

describe("RemovePasskeyHandler", () => {
  it("deletes an owned passkey and publishes a notice naming it (specs/032)", async () => {
    const passkeys = fakePasskeys({
      findByIdOwned: vi.fn().mockResolvedValue({ id: "p1", name: "Mi teléfono" }),
      deleteOwned: vi.fn().mockResolvedValue(true),
    });
    const publish = vi.fn();
    await build(passkeys, { publish }).execute(new RemovePasskeyCommand("u1", "p1", "s1"));

    expect(passkeys.deleteOwned).toHaveBeenCalledWith("u1", "p1", TX);
    const event = publish.mock.calls[0]![0] as AccountSecurityEvent;
    expect(event).toBeInstanceOf(AccountSecurityEvent);
    expect(event.kind).toBe("PASSKEY_REMOVED");
    expect(event.detail).toBe("Mi teléfono");
  });

  it("closes the other sessions opened with it, keeping the caller's (run-2)", async () => {
    const passkeys = fakePasskeys({
      findByIdOwned: vi.fn().mockResolvedValue({ id: "p1", name: "Llave" }),
      deleteOwned: vi.fn().mockResolvedValue(true),
    });
    const sessions = fakeSessions();
    await build(passkeys, { sessions }).execute(new RemovePasskeyCommand("u1", "p1", "s1"));

    expect(sessions.closeByPasskeysWithTx).toHaveBeenCalledWith(TX, ["p1"], expect.any(Date), "s1");
  });

  it("refuses without a recent step-up, before touching anything (run-2)", async () => {
    const passkeys = fakePasskeys({
      findByIdOwned: vi.fn().mockResolvedValue({ id: "p1", name: "Llave" }),
      deleteOwned: vi.fn().mockResolvedValue(true),
    });
    await expect(
      build(passkeys, { stepUp: steppedUp(null) }).execute(
        new RemovePasskeyCommand("u1", "p1", "s1"),
      ),
    ).rejects.toThrow(StepUpRequiredError);
    expect(passkeys.deleteOwned).not.toHaveBeenCalled();
  });

  it("throws PASSKEY_NOT_FOUND when it doesn't exist or isn't the caller's own", async () => {
    const passkeys = fakePasskeys({ findByIdOwned: vi.fn().mockResolvedValue(null) });
    await expect(
      build(passkeys).execute(new RemovePasskeyCommand("u1", "not-mine", "s1")),
    ).rejects.toThrow(PasskeyNotFoundError);
  });
});
