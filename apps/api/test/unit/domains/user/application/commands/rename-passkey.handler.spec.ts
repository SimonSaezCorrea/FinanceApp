import { describe, expect, it, vi } from "vitest";

import { RenamePasskeyHandler } from "../../../../../../src/domains/user/application/commands/rename-passkey.handler";
import { RenamePasskeyCommand } from "../../../../../../src/domains/user/application/commands/rename-passkey.command";
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

describe("RenamePasskeyHandler", () => {
  it("renames an owned passkey and returns its new state", async () => {
    const passkeys = fakePasskeys({
      renameOwned: vi.fn().mockResolvedValue({
        id: "p1",
        userId: "u1",
        name: "MacBook de Ana",
        credentialId: "cred1",
        publicKey: "pk1",
        counter: 0,
        transports: [],
        createdAt: "2026-01-01T00:00:00Z",
        lastUsedAt: "2026-01-02T00:00:00Z",
      }),
    });
    const handler = new RenamePasskeyHandler({ publish: vi.fn() } as never, passkeys);

    const result = await handler.execute(new RenamePasskeyCommand("u1", "p1", "MacBook de Ana"));

    expect(passkeys.renameOwned).toHaveBeenCalledWith("u1", "p1", "MacBook de Ana");
    expect(result).toEqual({
      id: "p1",
      name: "MacBook de Ana",
      createdAt: "2026-01-01T00:00:00Z",
      lastUsedAt: "2026-01-02T00:00:00Z",
    });
  });

  it("throws PASSKEY_NOT_FOUND when it doesn't exist or isn't the caller's own", async () => {
    const passkeys = fakePasskeys({ renameOwned: vi.fn().mockResolvedValue(null) });
    const handler = new RenamePasskeyHandler({ publish: vi.fn() } as never, passkeys);

    await expect(
      handler.execute(new RenamePasskeyCommand("u1", "not-mine", "New name")),
    ).rejects.toThrow(PasskeyNotFoundError);
  });
});
