import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CardsService } from "./cards.service";
import type { AccountsRepository } from "./accounts.repository";
import type { CardsRepository } from "./cards.repository";

const cardRow = {
  id: "c1",
  accountId: "a1",
  userId: "u1",
  name: "Visa",
  kind: "CREDIT" as const,
  last4: "1234",
  expiryMonth: 5,
  expiryYear: 2028,
  isActive: true,
  isPrimary: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  limits: [],
};

function make(repo: Partial<CardsRepository>, accountsRepo: Partial<AccountsRepository> = {}) {
  return new CardsService(
    {
      sumsByCard: vi.fn().mockResolvedValue([]),
      // Default: no existing primary — the next CREDIT card created becomes it.
      findPrimaryCreditCard: vi.fn().mockResolvedValue(null),
      ...repo,
    } as CardsRepository,
    {
      update: vi.fn(),
      ...accountsRepo,
    } as AccountsRepository,
  );
}

describe("CardsService", () => {
  it("creates a non-credit card with no pool/primary concerns at all", async () => {
    const create = vi.fn().mockResolvedValue({ ...cardRow, kind: "DEBIT", isPrimary: false });
    const svc = make({
      accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CHECKING", creditLimit: { toString: () => "0" }, currency: "CLP" }),
      create,
    });
    const card = await svc.create("u1", "a1", {
      name: "Visa",
      kind: "DEBIT",
      last4: "1234",
      expiryMonth: 5,
      expiryYear: 2028,
      isActive: true,
      usesAccountPool: true,
    });
    expect(card.last4).toBe("1234");
    expect(card.kind).toBe("DEBIT");
    expect(card.isActive).toBe(true);
    expect(card.isPrimary).toBe(false);
    expect(card.limits).toEqual([]);
  });

  it("throws when the account type cannot have cards (SAVINGS/INVESTMENT/CASH)", async () => {
    const svc = make({
      accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "SAVINGS" }),
    });
    await expect(
      svc.create("u1", "a1", {
        name: "x",
        kind: "DEBIT",
        last4: "1234",
        expiryMonth: 1,
        expiryYear: 2027,
        isActive: true,
        usesAccountPool: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when the account is not the user's", async () => {
    const svc = make({ accountExists: vi.fn().mockResolvedValue(null) });
    await expect(
      svc.create("u1", "nope", {
        name: "x",
        kind: "DEBIT",
        last4: "1234",
        expiryMonth: 1,
        expiryYear: 2027,
        isActive: true,
        usesAccountPool: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound removing a missing card", async () => {
    const svc = make({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "a1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- The account's PRIMARY credit card: its limit mirrors the account's own pool ---

  describe("primary credit card", () => {
    it("becomes primary, requires a limit in the account's currency, and writes it through to the account", async () => {
      const create = vi.fn().mockResolvedValue({ ...cardRow, isPrimary: true });
      const accountUpdate = vi.fn();
      const svc = make(
        {
          accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "0" }, currency: "CLP" }),
          findPrimaryCreditCard: vi.fn().mockResolvedValue(null),
          create,
        },
        { update: accountUpdate },
      );
      const card = await svc.create("u1", "a1", {
        name: "CMR Visa",
        kind: "CREDIT",
        last4: "4827",
        expiryMonth: 5,
        expiryYear: 2028,
        isActive: true,
        usesAccountPool: true,
        limits: [{ currency: "CLP", limitAmount: "1500000" }],
      });
      expect(card.isPrimary).toBe(true);
      expect(card.limits).toEqual([]); // the primary itself has no CardLimit rows
      expect(create.mock.calls[0]![2]).toMatchObject({ isPrimary: true });
      expect(create.mock.calls[0]![3]).toEqual([]); // no CardLimit rows created for it
      expect(accountUpdate).toHaveBeenCalledWith("u1", "a1", {
        creditLimit: "1500000",
        creditUsedInitial: "0",
      });
    });

    it("also persists an extra-currency limit as its own CardLimit row (independent pool)", async () => {
      const create = vi.fn().mockResolvedValue({
        ...cardRow,
        isPrimary: true,
        limits: [{ id: "l1", currency: "USD", limitAmount: { toString: () => "500" }, usedInitial: { toString: () => "0" } }],
      });
      const accountUpdate = vi.fn();
      const svc = make(
        {
          accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "0" }, currency: "CLP" }),
          findPrimaryCreditCard: vi.fn().mockResolvedValue(null),
          create,
        },
        { update: accountUpdate },
      );
      const card = await svc.create("u1", "a1", {
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
      });
      expect(accountUpdate).toHaveBeenCalledWith("u1", "a1", {
        creditLimit: "1500000",
        creditUsedInitial: "0",
      });
      expect(create.mock.calls[0]![3]).toEqual([
        { currency: "USD", limitAmount: "500", usedInitial: "0" },
      ]);
      expect(card.limits).toEqual([
        { id: "l1", currency: "USD", limitAmount: "500.0000", used: "0.0000" },
      ]);
    });

    it("rejects becoming primary with no limit supplied", async () => {
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "0" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      });
      await expect(
        svc.create("u1", "a1", {
          name: "CMR Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: true,
        }),
      ).rejects.toMatchObject({ response: { code: "CARD_LIMIT_REQUIRED" } });
    });

    it("rejects a zero or negative primary limit", async () => {
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "0" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      });
      await expect(
        svc.create("u1", "a1", {
          name: "CMR Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: true,
          limits: [{ currency: "CLP", limitAmount: "0" }],
        }),
      ).rejects.toMatchObject({ response: { code: "CARD_LIMIT_REQUIRED" } });
    });
  });

  // --- Additional (non-primary) cards: share the account pool, or carry their own sub-limit ---

  describe("additional credit cards", () => {
    it("defaults to sharing the account pool (no CardLimit rows) when a primary already exists", async () => {
      const create = vi.fn().mockResolvedValue({ ...cardRow, isPrimary: false });
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "3000000" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue({ id: "cPrimary" }),
        create,
      });
      const card = await svc.create("u1", "a1", {
        name: "CMR Visa · Camila",
        kind: "CREDIT",
        last4: "5938",
        expiryMonth: 5,
        expiryYear: 2028,
        isActive: true,
        usesAccountPool: true,
      });
      expect(card.isPrimary).toBe(false);
      expect(create.mock.calls[0]![2]).toMatchObject({ isPrimary: false });
      expect(create.mock.calls[0]![3]).toEqual([]);
    });

    it("persists a sub-limit within the account's pool and derives its `used`", async () => {
      const create = vi.fn().mockResolvedValue({
        ...cardRow,
        isPrimary: false,
        limits: [{ id: "l1", currency: "CLP", limitAmount: { toString: () => "1000000" }, usedInitial: { toString: () => "0" } }],
      });
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "3000000" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue({ id: "cPrimary" }),
        create,
        sumsByCard: vi
          .fn()
          .mockResolvedValue([{ cardId: "c1", currency: "CLP", type: "EXPENSE", sum: "250000" }]),
      });
      const card = await svc.create("u1", "a1", {
        name: "Visa · Camila",
        kind: "CREDIT",
        last4: "1234",
        expiryMonth: 5,
        expiryYear: 2028,
        isActive: true,
        usesAccountPool: false,
        limits: [{ currency: "CLP", limitAmount: "1000000" }],
      });
      expect(card.limits).toEqual([
        { id: "l1", currency: "CLP", limitAmount: "1000000.0000", used: "250000.0000" },
      ]);
    });

    it("rejects usesAccountPool: false with no limit supplied", async () => {
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "3000000" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue({ id: "cPrimary" }),
        create: vi.fn(),
      });
      await expect(
        svc.create("u1", "a1", {
          name: "Visa · Camila",
          kind: "CREDIT",
          last4: "1234",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: false,
        }),
      ).rejects.toMatchObject({ response: { code: "CARD_LIMIT_REQUIRED" } });
    });

    it("rejects a sub-limit greater than the account's own pool (same currency)", async () => {
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "1000000" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue({ id: "cPrimary" }),
        create: vi.fn(),
      });
      await expect(
        svc.create("u1", "a1", {
          name: "Visa · Camila",
          kind: "CREDIT",
          last4: "1234",
          expiryMonth: 5,
          expiryYear: 2028,
          isActive: true,
          usesAccountPool: false,
          limits: [{ currency: "CLP", limitAmount: "2000000" }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("allows a sub-limit in a different currency regardless of the account's own-currency pool", async () => {
      const create = vi.fn().mockResolvedValue({
        ...cardRow,
        isPrimary: false,
        limits: [{ id: "l2", currency: "USD", limitAmount: { toString: () => "500" }, usedInitial: { toString: () => "0" } }],
      });
      const svc = make({
        accountExists: vi.fn().mockResolvedValue({ id: "a1", type: "CREDIT_LINE", creditLimit: { toString: () => "100" }, currency: "CLP" }),
        findPrimaryCreditCard: vi.fn().mockResolvedValue({ id: "cPrimary" }),
        create,
      });
      const card = await svc.create("u1", "a1", {
        name: "Visa · Camila",
        kind: "CREDIT",
        last4: "1234",
        expiryMonth: 5,
        expiryYear: 2028,
        isActive: true,
        usesAccountPool: false,
        limits: [{ currency: "USD", limitAmount: "500" }],
      });
      expect(card.limits[0]).toMatchObject({ currency: "USD", limitAmount: "500.0000" });
    });
  });
});
