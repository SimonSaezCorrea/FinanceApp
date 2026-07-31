import { describe, expect, it, vi } from "vitest";

import { UpdateInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/update-installment-plan.handler";
import { UpdateInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/update-installment-plan.command";
import { RemoveInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/remove-installment-plan.handler";
import { RemoveInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/remove-installment-plan.command";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import { InstallmentPlanNotFoundError } from "../../../../../../src/domains/installment-plan/domain/errors";
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
    payments: [],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  });
}

function fakeRepo(overrides: Partial<InstallmentPlanRepositoryPort> = {}): InstallmentPlanRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    setPaymentPaidAt: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("UpdateInstallmentPlanHandler", () => {
  it("throws InstallmentPlanNotFoundError for a missing plan", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateInstallmentPlanHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new UpdateInstallmentPlanCommand("u1", "ghost", { title: "New" })),
    ).rejects.toBeInstanceOf(InstallmentPlanNotFoundError);
  });

  it("applies the patch and persists the updated scalars", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), save });
    const handler = new UpdateInstallmentPlanHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UpdateInstallmentPlanCommand("u1", "p1", { title: "New title" }));
    expect(result.title).toBe("New title");
    expect(save).toHaveBeenCalled();
  });
});

describe("RemoveInstallmentPlanHandler", () => {
  it("throws InstallmentPlanNotFoundError when nothing was removed", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveInstallmentPlanHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RemoveInstallmentPlanCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      InstallmentPlanNotFoundError,
    );
  });

  it("removes the plan", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveInstallmentPlanHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveInstallmentPlanCommand("u1", "p1"));
    expect(remove).toHaveBeenCalledWith("u1", "p1");
  });
});
