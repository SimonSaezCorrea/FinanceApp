import { describe, expect, it, vi } from "vitest";

import { CreateDebtHandler } from "../../../../../../src/domains/debt/application/commands/create-debt.handler";
import { CreateDebtCommand } from "../../../../../../src/domains/debt/application/commands/create-debt.command";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";

function fakeRepo(overrides: Partial<DebtRepositoryPort> = {}): DebtRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("CreateDebtHandler", () => {
  it("plans the debt and persists it via the repository", async () => {
    const create = vi.fn().mockImplementation(async (userId: string, plan) =>
      Debt.fromPersistence({
        id: "d1",
        userId,
        ...plan,
        createdAt: plan.openedAt,
        updatedAt: plan.openedAt,
      }),
    );
    const repo = fakeRepo({ create });
    const handler = new CreateDebtHandler({ publish: vi.fn() } as never, repo);

    const result = await handler.execute(
      new CreateDebtCommand("u1", {
        direction: "YOU_OWE",
        counterparty: "Acme Corp",
        principal: "1240.5",
        currency: "USD",
        openedAt: "2026-01-01T00:00:00.000Z",
        totalInstallments: 1,
        frequency: "MONTHLY",
        frequencyInterval: 1,
      }),
    );

    expect(result.id).toBe("d1");
    expect(result.counterparty).toBe("Acme Corp");
    expect(create).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ counterparty: "Acme Corp" }),
    );
  });
});
