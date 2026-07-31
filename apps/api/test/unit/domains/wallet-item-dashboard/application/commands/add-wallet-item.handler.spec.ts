import { describe, expect, it, vi } from "vitest";

import { AddWalletItemHandler } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/add-wallet-item.handler";
import { AddWalletItemCommand } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/add-wallet-item.command";
import { WalletItem } from "../../../../../../src/domains/wallet-item-dashboard/domain/wallet-item.aggregate";
import {
  WalletAccountNotFoundError,
  WalletCardNotFoundError,
  WalletItemExistsError,
} from "../../../../../../src/domains/wallet-item-dashboard/domain/errors";
import type { WalletItemRepositoryPort } from "../../../../../../src/domains/wallet-item-dashboard/domain/ports/wallet-item.repository.port";

function fakeRepo(overrides: Partial<WalletItemRepositoryPort> = {}): WalletItemRepositoryPort {
  return {
    list: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    accountOwned: vi.fn(),
    cardOwned: vi.fn(),
    existing: vi.fn().mockResolvedValue(false),
    create: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function makeItem(overrides: Partial<{ accountId: string | null; cardId: string | null; order: number }> = {}) {
  return WalletItem.fromPersistence({
    id: "w1",
    userId: "u1",
    accountId: null,
    cardId: "c1",
    order: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("AddWalletItemHandler", () => {
  it("adds a card item at the end (order = current count)", async () => {
    const create = vi.fn().mockResolvedValue(makeItem({ order: 2 }));
    const repo = fakeRepo({ cardOwned: vi.fn().mockResolvedValue(true), count: vi.fn().mockResolvedValue(2), create });
    const handler = new AddWalletItemHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(new AddWalletItemCommand("u1", { cardId: "c1" }));

    expect(result.cardId).toBe("c1");
    expect(create.mock.calls[0]![1]).toMatchObject({ cardId: "c1", order: 2 });
  });

  it("rejects pinning a card the user doesn't own", async () => {
    const repo = fakeRepo({ cardOwned: vi.fn().mockResolvedValue(false) });
    const handler = new AddWalletItemHandler({ publish: vi.fn() } as never, repo);

    await expect(handler.execute(new AddWalletItemCommand("u1", { cardId: "nope" }))).rejects.toBeInstanceOf(
      WalletCardNotFoundError,
    );
  });

  it("rejects pinning an account the user doesn't own", async () => {
    const repo = fakeRepo({ accountOwned: vi.fn().mockResolvedValue(false) });
    const handler = new AddWalletItemHandler({ publish: vi.fn() } as never, repo);

    await expect(handler.execute(new AddWalletItemCommand("u1", { accountId: "nope" }))).rejects.toBeInstanceOf(
      WalletAccountNotFoundError,
    );
  });

  it("rejects a duplicate pin", async () => {
    const repo = fakeRepo({
      accountOwned: vi.fn().mockResolvedValue(true),
      existing: vi.fn().mockResolvedValue(true),
    });
    const handler = new AddWalletItemHandler({ publish: vi.fn() } as never, repo);

    await expect(handler.execute(new AddWalletItemCommand("u1", { accountId: "a1" }))).rejects.toBeInstanceOf(
      WalletItemExistsError,
    );
  });
});
