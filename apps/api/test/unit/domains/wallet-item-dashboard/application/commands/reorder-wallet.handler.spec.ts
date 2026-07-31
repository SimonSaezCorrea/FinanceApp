import { describe, expect, it, vi } from "vitest";

import { ReorderWalletHandler } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/reorder-wallet.handler";
import { ReorderWalletCommand } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/reorder-wallet.command";
import { WalletItem } from "../../../../../../src/domains/wallet-item-dashboard/domain/wallet-item.aggregate";
import type { WalletItemRepositoryPort } from "../../../../../../src/domains/wallet-item-dashboard/domain/ports/wallet-item.repository.port";

function fakeRepo(overrides: Partial<WalletItemRepositoryPort> = {}): WalletItemRepositoryPort {
  return {
    list: vi.fn(),
    count: vi.fn(),
    accountOwned: vi.fn(),
    cardOwned: vi.fn(),
    existing: vi.fn(),
    create: vi.fn(),
    reorder: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("ReorderWalletHandler", () => {
  it("reorders then returns the fresh list", async () => {
    const item = WalletItem.fromPersistence({
      id: "w1",
      userId: "u1",
      accountId: null,
      cardId: "c1",
      order: 0,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const reorder = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([item]);
    const repo = fakeRepo({ reorder, list });
    const handler = new ReorderWalletHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(new ReorderWalletCommand("u1", ["w2", "w1"]));

    expect(reorder).toHaveBeenCalledWith("u1", ["w2", "w1"]);
    expect(list).toHaveBeenCalledWith("u1");
    expect(result.map((i) => i.id)).toEqual(["w1"]);
  });
});
