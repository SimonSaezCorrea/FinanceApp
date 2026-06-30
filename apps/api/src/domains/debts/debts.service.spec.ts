import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { DebtsService } from "./debts.service";
import type { DebtsRepository } from "./debts.repository";

const row = {
  id: "d1",
  userId: "u1",
  direction: "YOU_OWE" as const,
  counterparty: "Acme Corp",
  principal: { toString: () => "1240.5" },
  currency: "USD",
  openedAt: new Date("2026-01-01T00:00:00Z"),
  dueAt: new Date("2026-03-01T00:00:00Z"),
  interestApr: { toString: () => "5.25" },
  notes: null,
  settledAt: null,
  totalInstallments: 1,
  paidInstallments: 0,
  installmentAmount: null,
  frequency: "MONTHLY" as const,
  frequencyInterval: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService(repo: Partial<DebtsRepository>) {
  return new DebtsService(repo as DebtsRepository);
}

describe("DebtsService", () => {
  it("maps rows to the contract (money as fixed string, dates ISO)", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [debt] = await svc.list("u1");
    expect(debt).toEqual({
      id: "d1",
      direction: "YOU_OWE",
      counterparty: "Acme Corp",
      principal: "1240.5000",
      currency: "USD",
      openedAt: "2026-01-01T00:00:00.000Z",
      dueAt: "2026-03-01T00:00:00.000Z",
      interestApr: "5.2500",
      notes: null,
      settledAt: null,
      totalInstallments: 1,
      paidInstallments: 0,
      installmentAmount: null,
      frequency: "MONTHLY",
      frequencyInterval: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("defaults currency to USD on create", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      direction: "YOU_OWE",
      counterparty: "Acme Corp",
      principal: "1240.5",
      currency: "USD",
      openedAt: "2026-01-01T00:00:00.000Z",
      totalInstallments: 1,
      frequency: "MONTHLY",
      frequencyInterval: 1,
    });
    expect(create.mock.calls[0]![1]).toMatchObject({ currency: "USD" });
  });

  it("settle sets settledAt to a Date", async () => {
    const update = vi.fn().mockResolvedValue(row);
    const svc = makeService({ update });
    await svc.settle("u1", "d1");
    expect(update).toHaveBeenCalledWith("u1", "d1", { settledAt: expect.any(Date) });
  });

  it("throws NotFound when settling a missing debt", async () => {
    const svc = makeService({ update: vi.fn().mockResolvedValue(null) });
    await expect(svc.settle("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound when getting a missing debt", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound when removing a missing debt", async () => {
    const svc = makeService({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("registerPayment", () => {
    it("increments paidInstallments by 1", async () => {
      const installmentRow = { ...row, totalInstallments: 3, paidInstallments: 1 };
      const updatedRow = { ...installmentRow, paidInstallments: 2 };
      const svc = makeService({
        findOne: vi.fn().mockResolvedValue(installmentRow),
        update: vi.fn().mockResolvedValue(updatedRow),
      });
      const result = await svc.registerPayment("u1", "d1");
      expect(result.paidInstallments).toBe(2);
    });

    it("auto-settles when last payment is registered", async () => {
      const installmentRow = { ...row, totalInstallments: 3, paidInstallments: 2 };
      const settledRow = {
        ...installmentRow,
        paidInstallments: 3,
        settledAt: new Date(),
      };
      const update = vi.fn().mockResolvedValue(settledRow);
      const svc = makeService({
        findOne: vi.fn().mockResolvedValue(installmentRow),
        update,
      });
      await svc.registerPayment("u1", "d1");
      expect(update.mock.calls[0]?.[2]).toMatchObject({
        paidInstallments: 3,
        settledAt: expect.any(Date),
      });
    });

    it("throws ConflictException if debt already settled", async () => {
      const settledRow = { ...row, settledAt: new Date() };
      const svc = makeService({ findOne: vi.fn().mockResolvedValue(settledRow) });
      await expect(svc.registerPayment("u1", "d1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws ConflictException if all installments already paid", async () => {
      const fullPaidRow = { ...row, totalInstallments: 3, paidInstallments: 3 };
      const svc = makeService({ findOne: vi.fn().mockResolvedValue(fullPaidRow) });
      await expect(svc.registerPayment("u1", "d1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws NotFound if debt does not exist", async () => {
      const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
      await expect(svc.registerPayment("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
