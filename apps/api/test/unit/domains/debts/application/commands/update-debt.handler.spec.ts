import { describe, expect, it, vi } from "vitest";

import { UpdateDebtHandler } from "../../../../../../src/domains/debts/application/commands/update-debt.handler";
import { UpdateDebtCommand } from "../../../../../../src/domains/debts/application/commands/update-debt.command";
import { RemoveDebtHandler } from "../../../../../../src/domains/debts/application/commands/remove-debt.handler";
import { RemoveDebtCommand } from "../../../../../../src/domains/debts/application/commands/remove-debt.command";
import { Debt } from "../../../../../../src/domains/debts/domain/debt.aggregate";
import { DebtNotFoundError } from "../../../../../../src/domains/debts/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debts/domain/ports/debt.repository.port";

function makeDebt() {
  return Debt.fromPersistence({
    id: "d1",
    userId: "u1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1240.5",
    currency: "USD",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    dueAt: null,
    interestApr: null,
    notes: null,
    settledAt: null,
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

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

describe("UpdateDebtHandler", () => {
  it("throws DebtNotFoundError for a missing debt", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UpdateDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(
      handler.execute(new UpdateDebtCommand("u1", "ghost", { counterparty: "New" })),
    ).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("applies the patch and persists it", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt()), save });
    const handler = new UpdateDebtHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UpdateDebtCommand("u1", "d1", { counterparty: "New name" }));
    expect(result.counterparty).toBe("New name");
    expect(save).toHaveBeenCalled();
  });
});

describe("RemoveDebtHandler", () => {
  it("throws DebtNotFoundError when nothing was removed", async () => {
    const repo = fakeRepo({ remove: vi.fn().mockResolvedValue(false) });
    const handler = new RemoveDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RemoveDebtCommand("u1", "ghost"))).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("removes the debt", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ remove });
    const handler = new RemoveDebtHandler({ publish: vi.fn() } as never, repo);
    await handler.execute(new RemoveDebtCommand("u1", "d1"));
    expect(remove).toHaveBeenCalledWith("u1", "d1");
  });
});
