import { describe, expect, it, vi } from "vitest";

import { UpdateInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/update-installment-plan.handler";
import { UpdateInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/update-installment-plan.command";
import { RemoveInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/remove-installment-plan.handler";
import { RemoveInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/remove-installment-plan.command";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import {
  InstallmentCardIsCreditError,
  InstallmentPlanNotFoundError,
} from "../../../../../../src/domains/installment-plan/domain/errors";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeCardAccountRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";
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
    cardId: null,
    category: null,
    paymentAccountId: null,
    notes: null,
    payments: [],
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

function makeUpdateHandler(
  repo: InstallmentPlanRepositoryPort,
  cardKind: "CREDIT" | "DEBIT" | "PREPAID" | null = null,
) {
  return new UpdateInstallmentPlanHandler(
    { publish: vi.fn() } as never,
    repo,
    fakeCardAccountRepo({ kindForCard: vi.fn(async () => cardKind) }),
  );
}

describe("UpdateInstallmentPlanHandler", () => {
  it("throws InstallmentPlanNotFoundError for a missing plan", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const handler = makeUpdateHandler(repo);
    await expect(
      handler.execute(new UpdateInstallmentPlanCommand("u1", "ghost", { title: "New" })),
    ).rejects.toBeInstanceOf(InstallmentPlanNotFoundError);
  });

  it("applies the patch and persists the updated scalars", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), save });
    const handler = makeUpdateHandler(repo);
    const result = await handler.execute(
      new UpdateInstallmentPlanCommand("u1", "p1", { title: "New title" }),
    );
    expect(result.title).toBe("New title");
    expect(save).toHaveBeenCalled();
  });

  it("stores category and payment account", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), save });
    const result = await makeUpdateHandler(repo).execute(
      new UpdateInstallmentPlanCommand("u1", "p1", {
        category: "Hogar",
        paymentAccountId: "a1",
      }),
    );
    expect(result.category).toBe("Hogar");
    expect(result.paymentAccountId).toBe("a1");
  });

  // INV-P2, checked against the card the plan will have AFTER the patch: moving the
  // plan onto a credit card while it remembers an account is the same violation as
  // naming an account on a plan already on one.
  it("refuses a payment account once the plan's card is CREDIT", async () => {
    const save = vi.fn();
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), save });
    await expect(
      makeUpdateHandler(repo, "CREDIT").execute(
        new UpdateInstallmentPlanCommand("u1", "p1", {
          cardId: "cCredit",
          paymentAccountId: "a1",
        }),
      ),
    ).rejects.toBeInstanceOf(InstallmentCardIsCreditError);
    expect(save).not.toHaveBeenCalled();
  });
});

function makeRemoveHandler(
  repo: InstallmentPlanRepositoryPort,
  opts: {
    movements?: {
      id: string;
      bankAccountId: string | null;
      type: "INCOME" | "EXPENSE";
      amount: string;
      financeCharge: boolean;
    }[];
    account?: ReturnType<typeof accountAggregate> | null;
    calls?: {
      deleteManyWithTx: (tx: unknown, ids: string[]) => Promise<void>;
      incrementBalanceWithTx: (tx: unknown, accountId: string, delta: string) => Promise<void>;
      incrementCreditUsedWithTx: (tx: unknown, accountId: string, delta: string) => Promise<void>;
    };
  } = {},
) {
  const calls = opts.calls ?? {
    deleteManyWithTx: vi.fn(),
    incrementBalanceWithTx: vi.fn(),
    incrementCreditUsedWithTx: vi.fn(),
  };
  return new RemoveInstallmentPlanHandler(
    { publish: vi.fn() } as never,
    // `$transaction` just runs the callback: what this suite checks is WHAT is
    // reversed, not that Prisma opens a transaction (the integration tier does that).
    { $transaction: async (fn: (tx: unknown) => Promise<void>) => fn({}) } as never,
    repo,
    fakeBankAccountRepo({
      findById: vi.fn(async () => opts.account ?? null),
      incrementBalanceWithTx: calls.incrementBalanceWithTx,
      incrementCreditUsedWithTx: calls.incrementCreditUsedWithTx,
    }),
    fakeTransactionWriterRepo({
      listForInstallmentPlan: vi.fn(async () => opts.movements ?? []),
      deleteManyWithTx: calls.deleteManyWithTx,
    }),
  );
}

describe("RemoveInstallmentPlanHandler", () => {
  it("throws InstallmentPlanNotFoundError for a missing plan", async () => {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(
      makeRemoveHandler(repo).execute(new RemoveInstallmentPlanCommand("u1", "ghost")),
    ).rejects.toBeInstanceOf(InstallmentPlanNotFoundError);
  });

  it("removes the plan", async () => {
    const removeWithTx = vi.fn().mockResolvedValue(true);
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()), removeWithTx });
    await makeRemoveHandler(repo).execute(new RemoveInstallmentPlanCommand("u1", "p1"));
    expect(removeWithTx).toHaveBeenCalledWith(expect.anything(), "u1", "p1");
  });

  // FR-050a: deleting a plan reverses its whole history — the expenses go and the
  // balances come back — and the impact declared beforehand is this same figure.
  it("deletes the plan's movements and restores the balance that paid them", async () => {
    const calls = {
      deleteManyWithTx: vi.fn(),
      incrementBalanceWithTx: vi.fn(),
      incrementCreditUsedWithTx: vi.fn(),
    };
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()) });
    await makeRemoveHandler(repo, {
      calls,
      account: accountAggregate({ id: "a1", type: "CHECKING", currency: "USD" }),
      movements: [
        { id: "t1", bankAccountId: "a1", type: "EXPENSE", amount: "400", financeCharge: false },
        { id: "t2", bankAccountId: "a1", type: "EXPENSE", amount: "400", financeCharge: false },
      ],
    }).execute(new RemoveInstallmentPlanCommand("u1", "p1"));

    expect(calls.deleteManyWithTx).toHaveBeenCalledWith(expect.anything(), ["t1", "t2"]);
    expect(calls.incrementBalanceWithTx).toHaveBeenCalledWith(expect.anything(), "a1", "800.0000");
    expect(calls.incrementCreditUsedWithTx).not.toHaveBeenCalled();
  });
});
