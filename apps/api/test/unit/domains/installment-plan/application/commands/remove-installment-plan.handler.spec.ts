import { describe, expect, it, vi } from "vitest";

import { RemoveInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/remove-installment-plan.command";
import { RemoveInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/remove-installment-plan.handler";
import { InstallmentPlanSettledError } from "../../../../../../src/domains/installment-plan/domain/errors";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";
import { fakeBankAccountRepo, fakeTransactionWriterRepo } from "../../../../support/fake-ports";

function payment(
  over: Partial<Parameters<typeof InstallmentPlan.fromPersistence>[0]["payments"][number]> = {},
) {
  return {
    id: `pay${over.sequence ?? 1}`,
    sequence: 1,
    dueDate: new Date("2026-01-05"),
    amount: "90000",
    paidAt: null,
    paidAmount: null,
    carriedOverAmount: "0.0000",
    transactionId: null,
    creditStatementId: null,
    ...over,
  };
}

function makePlan(paymentOverride: ReturnType<typeof payment> = payment()) {
  return InstallmentPlan.fromPersistence({
    id: "p1",
    userId: "u1",
    title: "Notebook",
    totalPrincipal: "1080000",
    installmentCount: 12,
    startDate: new Date("2026-01-05"),
    currency: "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: "cCredit",
    category: null,
    paymentAccountId: null,
    notes: null,
    payments: [paymentOverride],
    createdAt: new Date("2026-01-05"),
    updatedAt: new Date("2026-01-05"),
  });
}

function fakeRepo(
  overrides: Partial<InstallmentPlanRepositoryPort> = {},
): InstallmentPlanRepositoryPort {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    createWithTx: vi.fn(),
    listBillableForCards: vi.fn(async () => []),
    stampBillableWithTx: vi.fn(),
    settleForStatementWithTx: vi.fn(),
    billedInstallmentsForStatement: vi.fn(async () => ({ amount: "0", count: 0 })),
    save: vi.fn(),
    savePaymentWithTx: vi.fn(),
    setPaymentPaidAt: vi.fn(),
    remove: vi.fn(),
    removeWithTx: vi.fn(async () => true),
    ...overrides,
  };
}

function fakePrisma() {
  return { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => cb({})) };
}

describe("RemoveInstallmentPlanHandler (spec 014, FR-006a)", () => {
  it("deletes a plan whose billed instalment's period is still PENDING (not settled)", async () => {
    const plan = makePlan(payment({ creditStatementId: "st_1", paidAt: null }));
    const removeWithTx = vi.fn(async () => true);
    const handler = new RemoveInstallmentPlanHandler(
      { publish: vi.fn() } as never,
      fakePrisma() as never,
      fakeRepo({ findOne: vi.fn(async () => plan), removeWithTx }),
      fakeBankAccountRepo(),
      fakeTransactionWriterRepo({ listForInstallmentPlan: vi.fn(async () => []) }),
    );

    await handler.execute(new RemoveInstallmentPlanCommand("u1", "p1"));

    expect(removeWithTx).toHaveBeenCalled();
  });

  it("refuses to delete a plan whose billed instalment's period is SETTLED", async () => {
    const plan = makePlan(payment({ creditStatementId: "st_1", paidAt: new Date("2026-02-05") }));
    const removeWithTx = vi.fn(async () => true);
    const handler = new RemoveInstallmentPlanHandler(
      { publish: vi.fn() } as never,
      fakePrisma() as never,
      fakeRepo({ findOne: vi.fn(async () => plan), removeWithTx }),
      fakeBankAccountRepo(),
      fakeTransactionWriterRepo({ listForInstallmentPlan: vi.fn(async () => []) }),
    );

    await expect(
      handler.execute(new RemoveInstallmentPlanCommand("u1", "p1")),
    ).rejects.toBeInstanceOf(InstallmentPlanSettledError);
    expect(removeWithTx).not.toHaveBeenCalled();
  });

  it("still deletes a plan with no billed instalments at all", async () => {
    const plan = makePlan(payment({ creditStatementId: null, paidAt: null }));
    const removeWithTx = vi.fn(async () => true);
    const handler = new RemoveInstallmentPlanHandler(
      { publish: vi.fn() } as never,
      fakePrisma() as never,
      fakeRepo({ findOne: vi.fn(async () => plan), removeWithTx }),
      fakeBankAccountRepo(),
      fakeTransactionWriterRepo({ listForInstallmentPlan: vi.fn(async () => []) }),
    );

    await handler.execute(new RemoveInstallmentPlanCommand("u1", "p1"));

    expect(removeWithTx).toHaveBeenCalled();
  });
});
