import { describe, expect, it, vi } from "vitest";

import { RegisterDebtPaymentHandler } from "../../../../../../src/domains/debt/application/commands/register-debt-payment.handler";
import { RegisterDebtPaymentCommand } from "../../../../../../src/domains/debt/application/commands/register-debt-payment.command";
import { UndoDebtPaymentHandler } from "../../../../../../src/domains/debt/application/commands/undo-debt-payment.handler";
import { UndoDebtPaymentCommand } from "../../../../../../src/domains/debt/application/commands/undo-debt-payment.command";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import {
  AllInstallmentsPaidError,
  DebtAlreadySettledError,
  DebtNotFoundError,
  NoPaymentsToUndoError,
} from "../../../../../../src/domains/debt/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";

function makeDebt(overrides: Partial<Parameters<typeof Debt.fromPersistence>[0]> = {}) {
  return Debt.fromPersistence({
    id: "d1",
    userId: "u1",
    direction: "YOU_OWE",
    counterparty: "Acme Corp",
    principal: "1200",
    currency: "USD",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    dueAt: null,
    interestApr: null,
    notes: null,
    settledAt: null,
    totalInstallments: 3,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
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

describe("RegisterDebtPaymentHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new RegisterDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RegisterDebtPaymentCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      DebtNotFoundError,
    );
  });

  it("throws DebtAlreadySettledError if already settled", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt({ settledAt: new Date() })) });
    const handler = new RegisterDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RegisterDebtPaymentCommand("u1", "d1"))).rejects.toBeInstanceOf(
      DebtAlreadySettledError,
    );
  });

  it("throws AllInstallmentsPaidError if all installments already paid", async () => {
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(makeDebt({ totalInstallments: 3, paidInstallments: 3 })),
    });
    const handler = new RegisterDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new RegisterDebtPaymentCommand("u1", "d1"))).rejects.toBeInstanceOf(
      AllInstallmentsPaidError,
    );
  });

  it("increments paidInstallments and persists it", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(makeDebt({ totalInstallments: 3, paidInstallments: 1 })),
      save,
    });
    const handler = new RegisterDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new RegisterDebtPaymentCommand("u1", "d1"));
    expect(result.paidInstallments).toBe(2);
    expect(save).toHaveBeenCalled();
  });

  it("auto-settles when the last payment is registered", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(makeDebt({ totalInstallments: 3, paidInstallments: 2 })),
      save,
    });
    const handler = new RegisterDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new RegisterDebtPaymentCommand("u1", "d1"));
    expect(result.paidInstallments).toBe(3);
    expect(result.settledAt).not.toBeNull();
  });
});

describe("UndoDebtPaymentHandler", () => {
  it("throws DebtNotFoundError when the debt is not the user's", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new UndoDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new UndoDebtPaymentCommand("u1", "ghost"))).rejects.toBeInstanceOf(
      DebtNotFoundError,
    );
  });

  it("throws NoPaymentsToUndoError if nothing was paid", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt({ paidInstallments: 0 })) });
    const handler = new UndoDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    await expect(handler.execute(new UndoDebtPaymentCommand("u1", "d1"))).rejects.toBeInstanceOf(
      NoPaymentsToUndoError,
    );
  });

  it("decrements paidInstallments and clears settledAt if it was settled", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({
      findOne: vi.fn().mockResolvedValue(
        makeDebt({ totalInstallments: 3, paidInstallments: 3, settledAt: new Date() }),
      ),
      save,
    });
    const handler = new UndoDebtPaymentHandler({ publish: vi.fn() } as never, repo);
    const result = await handler.execute(new UndoDebtPaymentCommand("u1", "d1"));
    expect(result.paidInstallments).toBe(2);
    expect(result.settledAt).toBeNull();
  });
});
