import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AccountsService } from "./accounts.service";
import type { AccountsRepository } from "./accounts.repository";
import type { CardsRepository } from "./cards.repository";

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

function makeService(repo: Partial<AccountsRepository>, cardsRepo: Partial<CardsRepository> = {}) {
  // Balance-series + credit-usage attach run on every read/write; default both to empty.
  return new AccountsService(
    {
      txWindow: vi.fn().mockResolvedValue([]),
      sumsByAccount: vi.fn().mockResolvedValue([]),
      ...repo,
    } as AccountsRepository,
    {
      sumsByCard: vi.fn().mockResolvedValue([]),
      ...cardsRepo,
    } as CardsRepository,
  );
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
            usesAccountPool: true,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("resolves the first inline CREDIT card as primary, mirroring its limit onto the account", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      name: "Cuenta",
      type: "CREDIT_LINE",
      status: "ACTIVE",
      currency: "CLP",
      cards: [
        {
          name: "CMR Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: true,
          limits: [{ currency: "CLP", limitAmount: "1500000" }],
        },
      ],
    });
    expect(create.mock.calls[0]![1]).toMatchObject({
      creditLimit: "1500000",
      creditUsedInitial: "0",
    });
    const cardInput = create.mock.calls[0]![1].cards.create[0];
    expect(cardInput).toMatchObject({ isPrimary: true });
    expect(cardInput.limits).toBeUndefined();
  });

  it("persists an inline primary CREDIT card's extra-currency limit as its own CardLimit row", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      name: "Cuenta",
      type: "CREDIT_LINE",
      status: "ACTIVE",
      currency: "CLP",
      cards: [
        {
          name: "CMR Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: true,
          limits: [
            { currency: "CLP", limitAmount: "1500000" },
            { currency: "USD", limitAmount: "500" },
          ],
        },
      ],
    });
    expect(create.mock.calls[0]![1]).toMatchObject({ creditLimit: "1500000" });
    const cardInput = create.mock.calls[0]![1].cards.create[0];
    expect(cardInput.limits).toEqual({
      create: [{ currency: "USD", limitAmount: "500", usedInitial: "0" }],
    });
  });

  it("rejects an inline primary CREDIT card with no limit", async () => {
    const svc = makeService({ create: vi.fn() });
    await expect(
      svc.create("u1", {
        name: "Cuenta",
        type: "CREDIT_LINE",
        status: "ACTIVE",
        currency: "CLP",
        cards: [
          {
            name: "CMR Visa",
            kind: "CREDIT",
            last4: "4827",
            expiryMonth: 5,
            expiryYear: 2028,
            isActive: true,
            usesAccountPool: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: "CARD_LIMIT_REQUIRED" } });
  });

  it("resolves a second inline CREDIT card as additional (pool by default, not primary)", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      name: "Cuenta",
      type: "CREDIT_LINE",
      status: "ACTIVE",
      currency: "CLP",
      cards: [
        {
          name: "CMR Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: true,
          limits: [{ currency: "CLP", limitAmount: "3000000" }],
        },
        {
          name: "CMR Visa · Camila",
          kind: "CREDIT",
          last4: "5938",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: true,
        },
      ],
    });
    const [primaryInput, additionalInput] = create.mock.calls[0]![1].cards.create;
    expect(primaryInput).toMatchObject({ isPrimary: true });
    expect(additionalInput).toMatchObject({ isPrimary: false });
    expect(additionalInput.limits).toBeUndefined();
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

    it("exposes creditPools combining the account's own currency and the primary card's extra-currency CardLimit", async () => {
      const withPrimaryCard = {
        ...creditRow,
        cards: [
          {
            id: "c1",
            name: "CMR Visa",
            kind: "CREDIT" as const,
            last4: "4827",
            expiryMonth: 5,
            expiryYear: 2028,
            isActive: true,
            isPrimary: true,
            limits: [
              {
                id: "l1",
                currency: "USD",
                limitAmount: { toString: () => "500" },
                usedInitial: { toString: () => "0" },
              },
            ],
          },
        ],
      };
      const svc = makeService(
        {
          list: vi.fn().mockResolvedValue([withPrimaryCard]),
          sumsByAccount: vi
            .fn()
            .mockResolvedValue([{ bankAccountId: "aC", type: "EXPENSE", sum: "1000000" }]),
        },
        {
          sumsByCard: vi
            .fn()
            .mockResolvedValue([{ cardId: "c1", currency: "USD", type: "EXPENSE", sum: "120" }]),
        },
      );
      const [acc] = await svc.list("u1", {});
      expect(acc.creditPools).toEqual([
        { currency: "CLP", limit: "3000000.0000", used: "1000000.0000" },
        { currency: "USD", limit: "500.0000", used: "120.0000" },
      ]);
    });

    it("gives each pool-sharing card its OWN spend via ownUsed, distinct from the account's combined creditUsed", async () => {
      const withTwoSharedCards = {
        ...creditRow,
        cards: [
          {
            id: "c1",
            name: "CMR Visa",
            kind: "CREDIT" as const,
            last4: "4827",
            expiryMonth: 5,
            expiryYear: 2028,
            isActive: true,
            isPrimary: true,
            limits: [],
          },
          {
            id: "c2",
            name: "CMR Visa · Camila",
            kind: "CREDIT" as const,
            last4: "5938",
            expiryMonth: 5,
            expiryYear: 2028,
            isActive: true,
            isPrimary: false,
            limits: [],
          },
        ],
      };
      const svc = makeService(
        {
          list: vi.fn().mockResolvedValue([withTwoSharedCards]),
          // Combined pool usage across both cards: 700,000 + 300,000 = 1,000,000.
          sumsByAccount: vi
            .fn()
            .mockResolvedValue([{ bankAccountId: "aC", type: "EXPENSE", sum: "1000000" }]),
        },
        {
          sumsByCard: vi.fn().mockResolvedValue([
            { cardId: "c1", currency: "CLP", type: "EXPENSE", sum: "700000" },
            { cardId: "c2", currency: "CLP", type: "EXPENSE", sum: "300000" },
          ]),
        },
      );
      const [acc] = await svc.list("u1", {});
      expect(acc.creditUsed).toBe("1000000.0000");
      const [primary, additional] = acc.cards;
      expect(primary!.ownUsed).toBe("700000.0000");
      expect(additional!.ownUsed).toBe("300000.0000");
      // Neither card has its own CardLimit — both still fully share the pool.
      expect(primary!.limits).toEqual([]);
      expect(additional!.limits).toEqual([]);
    });

    it("reports an empty creditPools for non-credit accounts", async () => {
      const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
      const [acc] = await svc.list("u1", {});
      expect(acc.creditPools).toEqual([]);
    });
  });
});
