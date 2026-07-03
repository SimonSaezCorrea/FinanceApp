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
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function make(repo: Partial<CardsRepository>) {
  return new CardsService(repo as CardsRepository);
}

describe("CardsService", () => {
  it("creates a card mapping last4 + kind + isActive", async () => {
    const create = vi.fn().mockResolvedValue(cardRow);
    const svc = make({ accountExists: vi.fn().mockResolvedValue({ id: "a1" }), create });
    const card = await svc.create("u1", "a1", {
      name: "Visa",
      kind: "CREDIT",
      last4: "1234",
      expiryMonth: 5,
      expiryYear: 2028,
      isActive: true,
    });
    expect(card.last4).toBe("1234");
    expect(card.kind).toBe("CREDIT");
    expect(card.isActive).toBe(true);
    // credit limits no longer live on the card (they moved to the CREDIT_LINE account)
    expect(card).not.toHaveProperty("limits");
  });

  it("creates a prepaid card", async () => {
    const create = vi.fn().mockResolvedValue({ ...cardRow, kind: "PREPAID" });
    const svc = make({ accountExists: vi.fn().mockResolvedValue({ id: "a1" }), create });
    const card = await svc.create("u1", "a1", {
      name: "Prepago",
      kind: "PREPAID",
      last4: "9999",
      expiryMonth: 1,
      expiryYear: 2027,
      isActive: true,
    });
    expect(card.kind).toBe("PREPAID");
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
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound removing a missing card", async () => {
    const svc = make({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "a1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
