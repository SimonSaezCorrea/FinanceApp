import { describe, expect, it, vi } from "vitest";

import { GetInstallmentPlanQueryHandler } from "../../../../../../src/domains/installment-plan/application/queries/get-installment-plan.handler";
import { GetInstallmentPlanQuery } from "../../../../../../src/domains/installment-plan/application/queries/get-installment-plan.query";
import { ListInstallmentPlansQueryHandler } from "../../../../../../src/domains/installment-plan/application/queries/list-installment-plans.handler";
import { ListInstallmentPlansQuery } from "../../../../../../src/domains/installment-plan/application/queries/list-installment-plans.query";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import { InstallmentPlanNotFoundError } from "../../../../../../src/domains/installment-plan/domain/errors";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";

function makePlan(id: string) {
  return InstallmentPlan.fromPersistence({
    id,
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

describe("GetInstallmentPlanQueryHandler", () => {
  it("throws InstallmentPlanNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new GetInstallmentPlanQueryHandler(repo);
    await expect(handler.execute(new GetInstallmentPlanQuery("u1", "ghost"))).rejects.toBeInstanceOf(
      InstallmentPlanNotFoundError,
    );
  });

  it("returns the plan as a contract", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan("p1")) });
    const handler = new GetInstallmentPlanQueryHandler(repo);
    const result = await handler.execute(new GetInstallmentPlanQuery("u1", "p1"));
    expect(result.id).toBe("p1");
  });
});

describe("ListInstallmentPlansQueryHandler", () => {
  it("lists the user's plans as contracts", async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue([makePlan("p1"), makePlan("p2")]) });
    const handler = new ListInstallmentPlansQueryHandler(repo);
    const result = await handler.execute(new ListInstallmentPlansQuery("u1"));
    expect(result.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
