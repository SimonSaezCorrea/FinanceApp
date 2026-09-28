import { describe, expect, it, vi } from "vitest";

import { ReplaceWalletCommand } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/replace-wallet.command";
import { ReplaceWalletHandler } from "../../../../../../src/domains/wallet-item-dashboard/application/commands/replace-wallet.handler";
import {
  WalletCardNotFoundError,
  WalletFullError,
} from "../../../../../../src/domains/wallet-item-dashboard/domain/errors";
import type { WalletItemRepositoryPort } from "../../../../../../src/domains/wallet-item-dashboard/domain/ports/wallet-item.repository.port";

function fakeRepo(overrides: Partial<WalletItemRepositoryPort> = {}): WalletItemRepositoryPort {
  return {
    list: vi.fn(),
    count: vi.fn(),
    accountOwned: vi.fn().mockResolvedValue(true),
    cardOwned: vi.fn().mockResolvedValue(true),
    existing: vi.fn(),
    create: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
    replace: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const handlerWith = (repo: WalletItemRepositoryPort) =>
  new ReplaceWalletHandler({ publish: vi.fn() } as never, repo);

describe("ReplaceWalletHandler", () => {
  it("writes the whole wallet in the order given", async () => {
    const repo = fakeRepo();
    await handlerWith(repo).execute(
      new ReplaceWalletCommand("u1", [{ cardId: "c1" }, { accountId: "a1" }]),
    );
    expect(repo.replace).toHaveBeenCalledWith("u1", [
      { accountId: null, cardId: "c1", order: 0 },
      { accountId: "a1", cardId: null, order: 1 },
    ]);
  });

  it("refuses someone else's card before writing anything", async () => {
    const repo = fakeRepo({ cardOwned: vi.fn().mockResolvedValue(false) });
    await expect(
      handlerWith(repo).execute(new ReplaceWalletCommand("u1", [{ cardId: "c9" }])),
    ).rejects.toBeInstanceOf(WalletCardNotFoundError);
    expect(repo.replace).not.toHaveBeenCalled();
  });

  it("refuses more than 4 entries", async () => {
    const repo = fakeRepo();
    const five = ["a1", "a2", "a3", "a4", "a5"].map((accountId) => ({ accountId }));
    await expect(
      handlerWith(repo).execute(new ReplaceWalletCommand("u1", five)),
    ).rejects.toBeInstanceOf(WalletFullError);
  });

  it("an empty list clears the wallet", async () => {
    const repo = fakeRepo();
    await handlerWith(repo).execute(new ReplaceWalletCommand("u1", []));
    expect(repo.replace).toHaveBeenCalledWith("u1", []);
  });
});
