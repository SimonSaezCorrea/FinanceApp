import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AccountsService } from "./accounts.service";
import type { AccountsRepository } from "./accounts.repository";

const row = {
  id: "a1",
  userId: "u1",
  name: "Checking",
  type: "CHECKING" as const,
  status: "ACTIVE" as const,
  currency: "CLP",
  institution: null,
  accountNumber: null,
  initialBalance: { toString: () => "100" },
  currentBalance: { toString: () => "100" },
  creditLimit: { toString: () => "0" },
  creditUsedInitial: { toString: () => "0" },
  cards: [],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService(repo: Partial<AccountsRepository>) {
  // Balance-series + credit-usage attach run on every read/write; default both to empty.
  return new AccountsService({
    txWindow: vi.fn().mockResolvedValue([]),
    sumsByAccount: vi.fn().mockResolvedValue([]),
    ...repo,
  } as AccountsRepository);
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
      creditLimit: "0.0000",
      creditUsed: "0",
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
      currency: "CLP",
      initialBalance: "100",
    });
    expect(create.mock.calls[0]![1]).toMatchObject({
      initialBalance: "100",
      currentBalance: "100",
    });
  });

  it("rejects inline cards[] on a non-cardable account type (SAVINGS/INVESTMENT/CASH)", async () => {
    const svc = makeService({ create: vi.fn() });
    await expect(
      svc.create("u1", {
        name: "Ahorro",
        type: "SAVINGS",
        status: "ACTIVE",
        currency: "CLP",
        cards: [
          {
            name: "x",
            kind: "DEBIT",
            last4: "1234",
            expiryMonth: 1,
            expiryYear: 2027,
            isActive: true,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reconciles currentBalance = initial + income - expense (exact)", async () => {
    const update = vi.fn().mockImplementation((_u, _id, data) => ({
      ...row,
      currentBalance: { toString: () => data.currentBalance },
    }));
    const svc = makeService({
      findOne: vi.fn().mockResolvedValue(row),
      sumByType: vi.fn().mockResolvedValue({ income: "250.50", expense: "75.25" }),
      update,
    });
    const acc = await svc.reconcile("u1", "a1");
    expect(update.mock.calls[0]![2]).toEqual({ currentBalance: "275.2500" });
    expect(acc.currentBalance).toBe("275.2500");
  });

  it("throws NotFound reconciling a missing account", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.reconcile("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- Derived credit `used` on a CREDIT_LINE account (standalone credit card) ---

  describe("derived credit used (CREDIT_LINE account)", () => {
    const creditRow = {
      ...row,
      id: "aC",
      type: "CREDIT_LINE" as const,
      creditLimit: { toString: () => "3000000" },
      creditUsedInitial: { toString: () => "0" },
    };

    it("computes used = seed + expense − income and exposes creditLimit", async () => {
      const svc = makeService({
        list: vi.fn().mockResolvedValue([creditRow]),
        sumsByAccount: vi.fn().mockResolvedValue([
          { bankAccountId: "aC", type: "EXPENSE", sum: "1024990" },
          { bankAccountId: "aC", type: "INCOME", sum: "24990" },
        ]),
      });
      const [acc] = await svc.list("u1", {});
      expect(acc.creditLimit).toBe("3000000.0000");
      // 0 + 1,024,990 − 24,990 = 1,000,000
      expect(acc.creditUsed).toBe("1000000.0000");
    });

    it("includes the creditUsedInitial seed", async () => {
      const seeded = { ...creditRow, creditUsedInitial: { toString: () => "50000" } };
      const svc = makeService({
        list: vi.fn().mockResolvedValue([seeded]),
        sumsByAccount: vi
          .fn()
          .mockResolvedValue([{ bankAccountId: "aC", type: "EXPENSE", sum: "100000" }]),
      });
      const [acc] = await svc.list("u1", {});
      // 50,000 + 100,000 − 0 = 150,000
      expect(acc.creditUsed).toBe("150000.0000");
    });

    it("reports creditUsed 0 for non-credit accounts", async () => {
      const svc = makeService({
        list: vi.fn().mockResolvedValue([row]),
        sumsByAccount: vi
          .fn()
          .mockResolvedValue([{ bankAccountId: "a1", type: "EXPENSE", sum: "999" }]),
      });
      const [acc] = await svc.list("u1", {});
      expect(acc.creditUsed).toBe("0");
    });
  });
});
