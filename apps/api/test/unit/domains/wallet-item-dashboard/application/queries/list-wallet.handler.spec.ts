import { describe, expect, it, vi } from "vitest";

import { ListWalletQueryHandler } from "../../../../../../src/domains/wallet-item-dashboard/application/queries/list-wallet.handler";
import { ListWalletQuery } from "../../../../../../src/domains/wallet-item-dashboard/application/queries/list-wallet.query";
import { WalletItem } from "../../../../../../src/domains/wallet-item-dashboard/domain/wallet-item.aggregate";
import type { WalletItemRepositoryPort } from "../../../../../../src/domains/wallet-item-dashboard/domain/ports/wallet-item.repository.port";

function makeItem(id: string) {
  return WalletItem.fromPersistence({
    id,
    userId: "u1",
    accountId: null,
    cardId: "c1",
    order: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
}

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

describe("ListWalletQueryHandler", () => {
  it("maps rows to the contract", async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue([makeItem("w1")]) });
    const handler = new ListWalletQueryHandler(repo);

    const result = await handler.execute(new ListWalletQuery("u1"));

    expect(result).toEqual([
      {
        id: "w1",
        accountId: null,
        cardId: "c1",
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
