import { describe, expect, it, vi } from "vitest";

import { GetDebtQueryHandler } from "../../../../../../src/domains/debt/application/queries/get-debt.handler";
import { GetDebtQuery } from "../../../../../../src/domains/debt/application/queries/get-debt.query";
import { ListDebtsQueryHandler } from "../../../../../../src/domains/debt/application/queries/list-debts.handler";
import { ListDebtsQuery } from "../../../../../../src/domains/debt/application/queries/list-debts.query";
import { Debt } from "../../../../../../src/domains/debt/domain/debt.aggregate";
import { DebtNotFoundError } from "../../../../../../src/domains/debt/domain/errors";
import type { DebtRepositoryPort } from "../../../../../../src/domains/debt/domain/ports/debt.repository.port";

function makeDebt(id: string) {
  return Debt.fromPersistence({
    id,
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
    totalInstallments: 1,
    paidInstallments: 0,
    installmentAmount: null,
    frequency: "MONTHLY",
    frequencyInterval: 1,
    paymentAccountId: null,
    lastPaymentTransactionId: null,
    lastPaymentAccountId: null,
    lastPaymentAmount: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

function fakeRepo(overrides: Partial<DebtRepositoryPort> = {}): DebtRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    findOneForUpdateWithTx: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

describe("GetDebtQueryHandler", () => {
  it("throws DebtNotFoundError when missing", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = new GetDebtQueryHandler(repo);
    await expect(handler.execute(new GetDebtQuery("u1", "ghost"))).rejects.toBeInstanceOf(
      DebtNotFoundError,
    );
  });

  it("returns the debt as a contract", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makeDebt("d1")) });
    const handler = new GetDebtQueryHandler(repo);
    const result = await handler.execute(new GetDebtQuery("u1", "d1"));
    expect(result.id).toBe("d1");
  });
});

describe("ListDebtsQueryHandler", () => {
  it("lists the user's debts as contracts", async () => {
    const repo = fakeRepo({ list: vi.fn().mockResolvedValue([makeDebt("d1"), makeDebt("d2")]) });
    const handler = new ListDebtsQueryHandler(repo);
    const result = await handler.execute(new ListDebtsQuery("u1"));
    expect(result.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});
