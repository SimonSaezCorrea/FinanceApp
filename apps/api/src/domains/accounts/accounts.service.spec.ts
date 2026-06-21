import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AccountsService } from "./accounts.service";
import type { AccountsRepository } from "./accounts.repository";

const row = {
  id: "a1",
  userId: "u1",
  name: "Checking",
  type: "CHECKING" as const,
  status: "ACTIVE" as const,
  currency: "USD",
  institution: null,
  initialBalance: { toString: () => "100" },
  currentBalance: { toString: () => "100" },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService(repo: Partial<AccountsRepository>) {
  // Balance-series attach runs on every read/write; default it to "no window tx".
  return new AccountsService({ txWindow: vi.fn().mockResolvedValue([]), ...repo } as AccountsRepository);
}

describe("AccountsService", () => {
  it("maps rows to the contract incl. type/status/balances as strings", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [acc] = await svc.list("u1", {});
    expect(acc).toMatchObject({
      id: "a1",
      type: "CHECKING",
      status: "ACTIVE",
      initialBalance: "100.0000",
      currentBalance: "100.0000",
    });
  });

  it("attaches a 30-point balance series ending at currentBalance", async () => {
    const svc = makeService({
      list: vi.fn().mockResolvedValue([row]),
      txWindow: vi.fn().mockResolvedValue([]),
    });
    const [acc] = await svc.list("u1", {});
    expect(acc.balanceSeries).toHaveLength(30);
    expect(acc.balanceSeries.at(-1)).toBe("100.0000");
    // Flat history (no tx) => no change.
    expect(acc.balanceChangePct).toBe("0.0");
  });

  it("translates status filter to the enum where-clause", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    await svc.list("u1", { status: "inactive" });
    expect(list.mock.calls[0]![1]).toEqual({ status: "INACTIVE" });
  });

  it("seeds currentBalance from initialBalance on create", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      name: "Checking",
      type: "CHECKING",
      status: "ACTIVE",
      currency: "USD",
      initialBalance: "100",
    });
    expect(create.mock.calls[0]![1]).toMatchObject({ initialBalance: "100", currentBalance: "100" });
  });

  it("reconciles currentBalance = initial + income - expense (exact)", async () => {
    const update = vi
      .fn()
      .mockImplementation((_u, _id, data) => ({
        ...row,
        currentBalance: { toString: () => data.currentBalance },
      }));
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(row),
      sumByType: vi.fn().mockResolvedValue({ income: "250.50", expense: "75.25" }),
      update,
    });
    const acc = await svc.reconcile("u1", "a1");
    // 100 + 250.50 - 75.25 = 275.25
    expect(update.mock.calls[0]![2]).toEqual({ currentBalance: "275.2500" });
    expect(acc.currentBalance).toBe("275.2500");
  });

  it("throws NotFound reconciling a missing account", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.reconcile("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
