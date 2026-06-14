import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { TransactionsService } from "./transactions.service";
import type { TransactionsRepository } from "./transactions.repository";

const row = {
  id: "t1",
  userId: "u1",
  bankAccountId: null,
  type: "EXPENSE" as const,
  amount: { toString: () => "33.3" },
  currency: "USD",
  occurredAt: new Date("2026-03-01T00:00:00Z"),
  category: "food",
  description: null,
  installmentPlanId: null,
  createdAt: new Date("2026-03-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
};

function makeService(repo: Partial<TransactionsRepository>) {
  return new TransactionsService(repo as TransactionsRepository);
}

describe("TransactionsService", () => {
  it("maps rows to the contract (amount fixed string)", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [tx] = await svc.list("u1", {});
    expect(tx.amount).toBe("33.3000");
    expect(tx.type).toBe("EXPENSE");
    expect(tx.occurredAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("builds a date-range + type filter for list", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    await svc.list("u1", { type: "INCOME", from: "2026-01-01T00:00:00.000Z" });
    const where = list.mock.calls[0]![1] as { type?: string; occurredAt?: { gte?: Date } };
    expect(where.type).toBe("INCOME");
    expect(where.occurredAt?.gte).toBeInstanceOf(Date);
  });

  it("converts occurredAt to a Date on create", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      type: "EXPENSE",
      amount: "33.30",
      currency: "USD",
      occurredAt: "2026-03-01T00:00:00.000Z",
    });
    const data = create.mock.calls[0]![1] as { occurredAt: Date };
    expect(data.occurredAt).toBeInstanceOf(Date);
  });

  it("throws NotFound when getting a missing transaction", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
