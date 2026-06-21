import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { WalletService } from "./wallet.service";
import type { WalletRepository } from "./wallet.repository";

const row = {
  id: "w1",
  userId: "u1",
  accountId: null,
  cardId: "c1",
  order: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function makeService(repo: Partial<WalletRepository>) {
  return new WalletService(repo as WalletRepository);
}

describe("WalletService", () => {
  it("maps rows to the contract", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [item] = await svc.list("u1");
    expect(item).toEqual({
      id: "w1",
      accountId: null,
      cardId: "c1",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("adds a card item at the end (order = current count)", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({
      cardOwned: vi.fn().mockResolvedValue({ id: "c1" }),
      existing: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(2),
      create,
    });
    await svc.add("u1", { cardId: "c1" });
    expect(create.mock.calls[0]![1]).toMatchObject({ cardId: "c1", order: 2 });
  });

  it("rejects pinning a card the user doesn't own", async () => {
    const svc = makeService({ cardOwned: vi.fn().mockResolvedValue(null) });
    await expect(svc.add("u1", { cardId: "nope" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a duplicate pin", async () => {
    const svc = makeService({
      accountOwned: vi.fn().mockResolvedValue({ id: "a1" }),
      existing: vi.fn().mockResolvedValue(row),
    });
    await expect(svc.add("u1", { accountId: "a1" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("reorders then returns the fresh list", async () => {
    const reorder = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([row]);
    const svc = makeService({ reorder, list });
    await svc.reorder("u1", ["w2", "w1"]);
    expect(reorder).toHaveBeenCalledWith("u1", ["w2", "w1"]);
    expect(list).toHaveBeenCalledWith("u1");
  });

  it("throws NotFound removing a missing item", async () => {
    const svc = makeService({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
