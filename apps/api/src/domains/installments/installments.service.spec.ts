import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { InstallmentsService } from "./installments.service";
import type { InstallmentsRepository } from "./installments.repository";

function makeService(repo: Partial<InstallmentsRepository>) {
  return new InstallmentsService(repo as InstallmentsRepository);
}

describe("InstallmentsService", () => {
  it("generates an equal-principal schedule with monthly due dates on create", async () => {
    const createWithPayments = vi.fn().mockImplementation((_userId, plan, payments) => ({
      id: "p1",
      userId: "u1",
      title: plan.title,
      totalPrincipal: { toString: () => String(plan.totalPrincipal) },
      installmentCount: plan.installmentCount,
      startDate: plan.startDate,
      currency: plan.currency,
      notes: null,
      createdAt: plan.startDate,
      updatedAt: plan.startDate,
      payments: payments.map((p: { sequence: number; dueDate: Date; amount: string }, i: number) => ({
        id: `pay${i}`,
        sequence: p.sequence,
        dueDate: p.dueDate,
        amount: { toString: () => p.amount },
        paidAt: null,
      })),
    }));
    const svc = makeService({ createWithPayments });

    const plan = await svc.create("u1", {
      title: "Laptop",
      totalPrincipal: "1200",
      installmentCount: 3,
      startDate: "2026-01-15T00:00:00.000Z",
      currency: "USD",
    });

    expect(plan.payments).toHaveLength(3);
    expect(plan.payments.map((p) => p.amount)).toEqual(["400.0000", "400.0000", "400.0000"]);
    // monthly due dates: Jan, Feb, Mar
    expect(plan.payments[0]!.dueDate.startsWith("2026-01")).toBe(true);
    expect(plan.payments[1]!.dueDate.startsWith("2026-02")).toBe(true);
    expect(plan.payments[2]!.dueDate.startsWith("2026-03")).toBe(true);
  });

  it("throws NotFound when paying a missing payment", async () => {
    const svc = makeService({ markPaid: vi.fn().mockResolvedValue(false) });
    await expect(svc.pay("u1", "p1", 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound when getting a missing plan", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
