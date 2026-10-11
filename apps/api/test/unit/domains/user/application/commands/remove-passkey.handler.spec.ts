import { describe, expect, it, vi } from "vitest";

import { RemovePasskeyHandler } from "../../../../../../src/domains/user/application/commands/remove-passkey.handler";
import { RemovePasskeyCommand } from "../../../../../../src/domains/user/application/commands/remove-passkey.command";
import { PasskeyNotFoundError } from "../../../../../../src/domains/user/domain/errors";
import { AccountSecurityEvent } from "../../../../../../src/domains/user/domain/events/account-security.event";
import type { PasskeyRepositoryPort } from "../../../../../../src/domains/passkey/domain/ports/passkey.repository.port";

function fakePasskeys(overrides: Partial<PasskeyRepositoryPort> = {}): PasskeyRepositoryPort {
  return {
    createWithTx: vi.fn(),
    findByUserId: vi.fn(),
    findByCredentialId: vi.fn(),
    findByIdOwned: vi.fn(),
    updateCounterAndLastUsedWithTx: vi.fn(),
    deleteOwned: vi.fn(),
    deleteAllForUserWithTx: vi.fn().mockResolvedValue(undefined),
    renameOwned: vi.fn(),
    ...overrides,
  };
}

describe("RemovePasskeyHandler", () => {
  it("deletes an owned passkey and publishes a notice naming it (specs/032)", async () => {
    const passkeys = fakePasskeys({
      findByIdOwned: vi.fn().mockResolvedValue({ id: "p1", name: "Mi teléfono" }),
      deleteOwned: vi.fn().mockResolvedValue(true),
    });
    const publish = vi.fn();
    const handler = new RemovePasskeyHandler({ publish } as never, passkeys);

    await handler.execute(new RemovePasskeyCommand("u1", "p1"));

    expect(passkeys.deleteOwned).toHaveBeenCalledWith("u1", "p1");
    const event = publish.mock.calls[0]![0] as AccountSecurityEvent;
    expect(event).toBeInstanceOf(AccountSecurityEvent);
    expect(event.kind).toBe("PASSKEY_REMOVED");
    expect(event.detail).toBe("Mi teléfono");
  });

  it("throws PASSKEY_NOT_FOUND when it doesn't exist or isn't the caller's own", async () => {
    const passkeys = fakePasskeys({ deleteOwned: vi.fn().mockResolvedValue(false) });
    const handler = new RemovePasskeyHandler({ publish: vi.fn() } as never, passkeys);

    await expect(handler.execute(new RemovePasskeyCommand("u1", "not-mine"))).rejects.toThrow(
      PasskeyNotFoundError,
    );
  });
});
