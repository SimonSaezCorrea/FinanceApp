import { describe, expect, it, vi } from "vitest";

import { RemoveWalletItemHandler } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/remove-wallet-item.handler";
import { RemoveWalletItemCommand } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/remove-wallet-item.command";
import { WalletItemNotFoundError } from "../../../../../../src/domains/wallet-item-dashboard/domain/errors";
import type { WalletItemRepositoryPort } from "../../../../../../src/domains/wallet-item-dashboard/domain/ports/wallet-item.repository.port";

function fakeRepo(overrides: Partial<WalletItemRepositoryPort> = {}): WalletItemRepositoryPort {
  return {
    list: vi.fn(),
    count: vi.fn(),
    accountOwned: vi.fn(),
    cardOwned: vi.fn(),
    existing: vi.fn(),
    create: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("RemoveWalletItemHandler", () => {
  it("throws NotFound removing a missing item", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveWalletItemHandler({ publish: vi.fn() } as never, repo);

    await expect(handler.execute(new RemoveWalletItemCommand("u1", "nope"))).rejects.toBeInstanceOf(
      WalletItemNotFoundError,
    );
  });

  it("removes an existing item", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveWalletItemHandler({ publish: vi.fn() } as never, repo);

    await handler.execute(new RemoveWalletItemCommand("u1", "w1"));

    expect(remove).toHaveBeenCalledWith("u1", "w1");
  });
});
