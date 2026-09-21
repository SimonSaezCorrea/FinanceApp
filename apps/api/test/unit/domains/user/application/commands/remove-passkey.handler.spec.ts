import { describe, expect, it, vi } from "vitest";

import { RemovePasskeyHandler } from "../../../../../../src/domains/user/application/commands/remove-passkey.handler";
import { RemovePasskeyCommand } from "../../../../../../src/domains/user/application/commands/remove-passkey.command";
import { PasskeyNotFoundError } from "../../../../../../src/domains/user/domain/errors";
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
  it("deletes an owned passkey", async () => {
    const passkeys = fakePasskeys({ deleteOwned: vi.fn().mockResolvedValue(true) });
    const handler = new RemovePasskeyHandler({ publish: vi.fn() } as never, passkeys);

    await handler.execute(new RemovePasskeyCommand("u1", "p1"));

    expect(passkeys.deleteOwned).toHaveBeenCalledWith("u1", "p1");
  });

  it("throws PASSKEY_NOT_FOUND when it doesn't exist or isn't the caller's own", async () => {
    const passkeys = fakePasskeys({ deleteOwned: vi.fn().mockResolvedValue(false) });
    const handler = new RemovePasskeyHandler({ publish: vi.fn() } as never, passkeys);

    await expect(handler.execute(new RemovePasskeyCommand("u1", "not-mine"))).rejects.toThrow(
      PasskeyNotFoundError,
    );
  });
});
