import { describe, expect, it, vi } from "vitest";

import { SettleDebtHandler } from "../../../../../../src/domains/debt/application/commands/settle-debt.handler";
import { SettleDebtCommand } from "../../../../../../src/domains/debt/application/commands/settle-debt.command";
import { UnsettleDebtHandler } from "../../../../../../src/domains/debt/application/commands/unsettle-debt.handler";
import { UnsettleDebtCommand } from "../../../../../../src/domains/debt/application/commands/unsettle-debt.command";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import { DebtNotFoundError, DebtNotSettledError } from "../../../../../../src/domains/debt/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";

function makeDebt(settledAt: Date | null = null) {
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
    settledAt,
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

describe("SettleDebtHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new SettleDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new SettleDebtCommand("u1", "ghost"))).rejects.toBeInstanceOf(DebtNotFoundError);
  });

  it("settles the debt with no guard against re-settling", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt(new Date())), save });
    const handler = new SettleDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new SettleDebtCommand("u1", "d1"))).resolves.toBeUndefined();
    expect(save).toHaveBeenCalled();
  });
});

describe("UnsettleDebtHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UnsettleDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new UnsettleDebtCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      DebtNotFoundError,
    );
  });

  it("throws DebtNotSettledError when not currently settled", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt(null)) });
    const handler = new UnsettleDebtHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new UnsettleDebtCommand("u1", "d1"))).rejects.toBeInstanceOf(
      DebtNotSettledError,
    );
  });

  it("clears settledAt and persists it", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt(new Date())), save });
    const handler = new UnsettleDebtHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UnsettleDebtCommand("u1", "d1"));
    expect(result.settledAt).toBeNull();
    expect(save).toHaveBeenCalled();
  });
});
