import { describe, expect, it, vi } from "vitest";

import { CreateInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/create-installment-plan.handler";
import { CreateInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/create-installment-plan.command";
import { fakeCardAccountRepo } from "../../../../support/fake-ports";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";

function fakeRepo(
  overrides: Partial<InstallmentPlanRepositoryPort> = {},
): InstallmentPlanRepositoryPort {
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

function makeHandler(repo: InstallmentPlanRepositoryPort) {
  // The handler also charges a plan's interest to the card's pool; these fakes keep
  // that path inert (no card ⇒ nothing is charged) unless a test wires it.
  return new CreateInstallmentPlanHandler(
    { publish: vi.fn() } as never,
    repo,
    fakeCardAccountRepo(),
    {
      createWithTx: vi.fn(),
      relinkToStatementWithTx: vi.fn(),
      updateAmountWithTx: vi.fn(),
    } as never,
    {} as never,
  );
}

describe("CreateInstallmentPlanHandler", () => {
  it("generates the schedule and persists it via the repository", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      InstallmentPlan.fromPersistence({
        id: "p1",
        userId,
        title: plan.title,
        totalPrincipal: plan.totalPrincipal,
        installmentCount: plan.installmentCount,
        startDate: plan.startDate,
        currency: plan.currency,
        frequency: plan.frequency,
        frequencyInterval: plan.frequencyInterval,
        cardId: plan.cardId ?? null,
        notes: plan.notes,
        payments: plan.payments.map(
          (p: { sequence: number; dueDate: Date; amount: string }, i: number) => ({
            id: `pay${i}`,
            sequence: p.sequence,
            dueDate: p.dueDate,
            amount: p.amount,
            paidAt: null,
          }),
        ),
        createdAt: plan.startDate,
        updatedAt: plan.startDate,
      }),
    );
    const repo = fakeRepo({ create });
    const handler = makeHandler(repo);

    const result = await handler.execute(
      new CreateInstallmentPlanCommand("u1", {
        title: "Laptop",
        totalPrincipal: "1200",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
      }),
    );

    expect(result.id).toBe("p1");
    expect(result.payments).toHaveLength(3);
    expect(result.payments.map((p) => p.amount)).toEqual(["400.0000", "400.0000", "400.0000"]);
    expect(create).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ title: "Laptop", installmentCount: 3 }),
    );
  });
});
