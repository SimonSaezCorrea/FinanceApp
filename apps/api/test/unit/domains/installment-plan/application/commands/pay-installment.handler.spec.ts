import { describe, expect, it, vi } from "vitest";

import { PayInstallmentHandler } from "../../../../../../src/domains/installment-plan/application/commands/pay-installment.handler";
import { PayInstallmentCommand } from "../../../../../../src/domains/installment-plan/application/commands/pay-installment.command";
import { UnpayInstallmentHandler } from "../../../../../../src/domains/installment-plan/application/commands/unpay-installment.handler";
import { UnpayInstallmentCommand } from "../../../../../../src/domains/installment-plan/application/commands/unpay-installment.command";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import {
  InstallmentPlanNotFoundError,
  InstallmentPaymentNotFoundError,
} from "../../../../../../src/domains/installment-plan/domain/errors";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";

function makePlan() {
  return InstallmentPlan.fromPersistence({
    id: "p1",
    userId: "u1",
    title: "Laptop",
    totalPrincipal: "1200",
    installmentCount: 3,
    startDate: new Date("2026-01-15"),
    currency: "USD",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    notes: null,
    payments: [
      { id: "pay1", sequence: 1, dueDate: new Date("2026-01-15"), amount: "400", paidAt: null },
      { id: "pay2", sequence: 2, dueDate: new Date("2026-02-15"), amount: "400", paidAt: null },
    ],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  });
}

function fakeRepo(
  overrides: Partial<InstallmentPlanRepositoryPort> = {},
): InstallmentPlanRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    setPaymentPaidAt: vi.fn().mockResolvedValue(true),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("PayInstallmentHandler", () => {
  it("throws InstallmentPlanNotFoundError when the plan is not the user's", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new PayInstallmentHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new PayInstallmentCommand("u1", "ghost", 1)),
    ).rejects.toBeInstanceOf(InstallmentPlanNotFoundError);
  });

  it("throws InstallmentPaymentNotFoundError for an unknown sequence", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()) });
    const handler = new PayInstallmentHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new PayInstallmentCommand("u1", "p1", 99))).rejects.toBeInstanceOf(
      InstallmentPaymentNotFoundError,
    );
  });

  it("marks the payment paid and persists only that payment", async () => {
    const setPaymentPaidAt = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), setPaymentPaidAt });
    const handler = new PayInstallmentHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new PayInstallmentCommand("u1", "p1", 2));
    expect(setPaymentPaidAt).toHaveBeenCalledWith("u1", "p1", 2, expect.any(Date));
  });
});

describe("UnpayInstallmentHandler", () => {
  it("throws InstallmentPlanNotFoundError when the plan is not the user's", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UnpayInstallmentHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new UnpayInstallmentCommand("u1", "ghost", 1)),
    ).rejects.toBeInstanceOf(InstallmentPlanNotFoundError);
  });

  it("clears the payment's paid status and persists null", async () => {
    const setPaymentPaidAt = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), setPaymentPaidAt });
    const handler = new UnpayInstallmentHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new UnpayInstallmentCommand("u1", "p1", 1));
    expect(setPaymentPaidAt).toHaveBeenCalledWith("u1", "p1", 1, null);
  });
});
