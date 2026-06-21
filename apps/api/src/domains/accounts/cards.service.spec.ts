import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CardsService } from "./cards.service";
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
  createdAt: new Date(),
  updatedAt: new Date(),
  limits: [{ id: "l1", cardId: "c1", currency: "USD", limit: { toString: () => "1000" }, used: { toString: () => "250" } }],
};

function make(repo: Partial<CardsRepository>) {
  return new CardsService(repo as CardsRepository);
}

describe("CardsService", () => {
  it("creates a credit card with limits and maps last4 + limits", async () => {
    const create = vi.fn().mockResolvedValue(cardRow);
    const svc = make({ accountExists: vi.fn().mockResolvedValue({ id: "a1" }), create });
    const card = await svc.create("u1", "a1", {
      name: "Visa",
      kind: "CREDIT",
      last4: "1234",
      expiryMonth: 5,
      expiryYear: 2028,
      limits: [{ currency: "USD", limit: "1000", used: "250" }],
    });
    expect(card.last4).toBe("1234");
    expect(card.limits[0]).toEqual({ currency: "USD", limit: "1000.0000", used: "250.0000" });
    // limits forwarded to repo
    expect(create.mock.calls[0]![3]).toHaveLength(1);
  });

  it("drops limits for a debit card", async () => {
    const create = vi.fn().mockResolvedValue({ ...cardRow, kind: "DEBIT", limits: [] });
    const svc = make({ accountExists: vi.fn().mockResolvedValue({ id: "a1" }), create });
    await svc.create("u1", "a1", {
      name: "Maestro",
      kind: "DEBIT",
      last4: "9999",
      expiryMonth: 1,
      expiryYear: 2027,
      limits: [{ currency: "USD", limit: "1000", used: "0" }],
    });
    expect(create.mock.calls[0]![3]).toEqual([]); // no limits persisted for debit
  });

  it("throws when the account is not the user's", async () => {
    const svc = make({ accountExists: vi.fn().mockResolvedValue(null) });
    await expect(
      svc.create("u1", "nope", { name: "x", kind: "DEBIT", last4: "1234", expiryMonth: 1, expiryYear: 2027 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound removing a missing card", async () => {
    const svc = make({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "a1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
