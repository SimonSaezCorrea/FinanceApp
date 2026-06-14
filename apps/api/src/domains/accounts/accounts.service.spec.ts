import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AccountsService } from "./accounts.service";
import type { AccountsRepository } from "./accounts.repository";

const row = {
  id: "a1",
  userId: "u1",
  name: "Checking",
  currency: "USD",
  institution: null,
  currentBalance: { toString: () => "1240.5" },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService(repo: Partial<AccountsRepository>) {
  return new AccountsService(repo as AccountsRepository);
}

describe("AccountsService", () => {
  it("maps rows to the contract (money as fixed string, dates ISO)", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [acc] = await svc.list("u1");
    expect(acc).toEqual({
      id: "a1",
      name: "Checking",
      currency: "USD",
      institution: null,
      currentBalance: "1240.5000",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("defaults currentBalance to 0 on create", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", { name: "Checking", currency: "USD" });
    expect(create.mock.calls[0]![1]).toMatchObject({ currentBalance: "0" });
  });

  it("throws NotFound when getting a missing account", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound when removing a missing account", async () => {
    const svc = makeService({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
