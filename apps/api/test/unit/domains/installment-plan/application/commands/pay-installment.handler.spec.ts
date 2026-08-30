import { describe, expect, it, vi } from "vitest";

import { PayInstallmentCommand } from "../../../../../../src/domains/installment-plan/application/commands/pay-installment.command";
import { PayInstallmentHandler } from "../../../../../../src/domains/installment-plan/application/commands/pay-installment.handler";
import { UnpayInstallmentCommand } from "../../../../../../src/domains/installment-plan/application/commands/unpay-installment.command";
import { UnpayInstallmentHandler } from "../../../../../../src/domains/installment-plan/application/commands/unpay-installment.handler";
import {
  InstallmentCardIsCreditError,
  InstallmentPaymentAccountRequiredError,
  InstallmentPaymentFromCreditAccountError,
  InstallmentPaymentNotFoundError,
  InstallmentPlanNotFoundError,
  PaymentCurrencyAmbiguousError,
} from "../../../../../../src/domains/installment-plan/domain/errors";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";
import {
  fakeBankAccountRepo,
  fakeCardAccountRepo,
  fakeTransactionWriterRepo,
} from "../../../../support/fake-ports";

function makePlan(over: { cardId?: string | null; currency?: string } = {}) {
  return InstallmentPlan.fromPersistence({
    id: "p1",
    userId: "u1",
    title: "Laptop",
    totalPrincipal: "1200",
    installmentCount: 2,
    startDate: new Date("2026-01-15"),
    currency: over.currency ?? "USD",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: over.cardId ?? null,
    category: "Tecnología",
    paymentAccountId: "acc1",
    notes: null,
    payments: [
      {
        id: "pay1",
        sequence: 1,
        dueDate: new Date("2026-01-15"),
        amount: "400",
        paidAt: null,
        paidAmount: null,
        carriedOverAmount: "0.0000",
        transactionId: null,
        creditStatementId: null,
      },
      {
        id: "pay2",
        sequence: 2,
        dueDate: new Date("2026-02-15"),
        amount: "400",
        paidAt: null,
        paidAmount: null,
        carriedOverAmount: "0.0000",
        transactionId: null,
        creditStatementId: null,
      },
    ],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  });
}

/** An account as the bank-account port hands it over. */
function fakeAccount(
  over: Partial<{ type: string; currency: string; currentBalance: string }> = {},
) {
  return {
    snapshot: () => ({
      id: "acc1",
      type: over.type ?? "CHECKING",
      currency: over.currency ?? "USD",
      currentBalance: over.currentBalance ?? "10000",
      overdraftLimit: "0",
    }),
  } as never;
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
    setPaymentPaidAt: vi.fn().mockResolvedValue(true),
    remove: vi.fn(),
    removeWithTx: vi.fn(async () => true),
    ...overrides,
  };
}

/** `$transaction` just runs the callback: these tests are about WHAT is written, and
 *  the real atomicity is proven against a database in the integration suite. */
const fakePrisma = { $transaction: async (fn: (tx: unknown) => Promise<void>) => fn({}) } as never;

function payHandler(
  over: {
    repo?: InstallmentPlanRepositoryPort;
    accounts?: ReturnType<typeof fakeBankAccountRepo>;
    cards?: ReturnType<typeof fakeCardAccountRepo>;
    transactions?: ReturnType<typeof fakeTransactionWriterRepo>;
  } = {},
) {
  const repo = over.repo ?? fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan()) });
  const accounts =
    over.accounts ?? fakeBankAccountRepo({ findById: vi.fn(async () => fakeAccount()) });
  const cards = over.cards ?? fakeCardAccountRepo();
  const transactions = over.transactions ?? fakeTransactionWriterRepo();
  const handler = new PayInstallmentHandler(
    { publish: vi.fn() } as never,
    fakePrisma,
    repo,
    accounts,
    cards,
    transactions,
  );
  return { handler, repo, accounts, cards, transactions };
}

function command(over: Partial<PayInstallmentCommand> = {}) {
  return new PayInstallmentCommand(
    "u1",
    (over.planId as string) ?? "p1",
    over.sequence ?? 1,
    over.fromAccountId === undefined ? "acc1" : over.fromAccountId,
    over.amount ?? null,
    over.chargedAmount ?? null,
    over.paidAt ?? null,
  );
}

describe("PayInstallmentHandler", () => {
  it("throws when the plan is not the user's", async () => {
    const { handler } = payHandler({
      repo: fakeRepo({ findOne: vi.fn().mockResolvedValue(null) }),
    });
    await expect(handler.execute(command({ planId: "ghost" }))).rejects.toBeInstanceOf(
      InstallmentPlanNotFoundError,
    );
  });

  it("throws for an unknown sequence", async () => {
    const { handler } = payHandler();
    await expect(handler.execute(command({ sequence: 99 }))).rejects.toBeInstanceOf(
      InstallmentPaymentNotFoundError,
    );
  });

  it("records a real expense on the paying account, dated when it was paid", async () => {
    const { handler, transactions } = payHandler();
    const paidAt = new Date("2026-02-20T00:00:00.000Z");
    await handler.execute(command({ paidAt }));

    expect(transactions.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bankAccountId: "acc1",
        type: "EXPENSE",
        amount: "400.0000",
        currency: "USD",
        occurredAt: paidAt,
        installmentPlanId: "p1",
      }),
    );
  });

  it("takes the charge out of the account's balance", async () => {
    const { handler, accounts } = payHandler();
    await handler.execute(command());

    expect(accounts.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc1",
      "-400.0000",
    );
  });

  it("requires a paying account on a plan that records movements", async () => {
    const { handler } = payHandler();
    await expect(handler.execute(command({ fromAccountId: null }))).rejects.toBeInstanceOf(
      InstallmentPaymentAccountRequiredError,
    );
  });

  it("refuses a credit-card account as the source: debt paid with debt (FR-028b)", async () => {
    const { handler } = payHandler({
      accounts: fakeBankAccountRepo({
        findById: vi.fn(async () => fakeAccount({ type: "CREDIT_CARD" })),
      }),
    });
    await expect(handler.execute(command())).rejects.toBeInstanceOf(
      InstallmentPaymentFromCreditAccountError,
    );
  });
});

describe("PayInstallmentHandler — currencies (FR-029/FR-030/FR-031)", () => {
  it("refuses to guess when account and plan differ and no charge is stated", async () => {
    const { handler } = payHandler({
      accounts: fakeBankAccountRepo({
        findById: vi.fn(async () => fakeAccount({ currency: "CLP" })),
      }),
    });
    await expect(handler.execute(command())).rejects.toBeInstanceOf(PaymentCurrencyAmbiguousError);
  });

  it("charges the account in ITS currency while crediting the debt in the plan's", async () => {
    const { handler, transactions, repo } = payHandler({
      accounts: fakeBankAccountRepo({
        findById: vi.fn(async () => fakeAccount({ currency: "CLP" })),
      }),
    });
    await handler.execute(command({ amount: "400", chargedAmount: "380000" }));

    expect(transactions.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: "380000", currency: "CLP" }),
    );
    // The instalment was credited with the PLAN-currency figure, not the charge.
    const saved = vi.mocked(repo.savePaymentWithTx).mock.calls[0]![1];
    expect(saved.payments.find((p) => p.sequence === 1)?.paidAmount).toBe("400.0000");
  });
});

describe("PayInstallmentHandler — credit-card plans (FR-035/FR-037)", () => {
  const creditCards = () =>
    fakeCardAccountRepo({ kindForCard: vi.fn(async () => "CREDIT" as const) });

  // Spec 014, FR-021/FR-022a: superseded. These instalments settle when the card's
  // STATEMENT is paid — never one at a time. Hiding the button in the UI stops the
  // accidental click; refusing here server-side is what stops a direct API call
  // from creating the double-count the whole feature exists to prevent. There is
  // no "mark only, no movement" success path left for these plans at all.
  it.each([
    ["with no paying account", null],
    ["with a paying account", "acc1"],
  ])("refuses to pay an instalment individually %s (FR-022a)", async (_label, fromAccountId) => {
    const { handler, transactions, accounts } = payHandler({
      repo: fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan({ cardId: "c1" })) }),
      cards: creditCards(),
    });
    await expect(handler.execute(command({ fromAccountId }))).rejects.toBeInstanceOf(
      InstallmentCardIsCreditError,
    );
    expect(transactions.createWithTx).not.toHaveBeenCalled();
    expect(accounts.incrementBalanceWithTx).not.toHaveBeenCalled();
  });

  it("DOES record a movement for a debit card: there the money leaves each time (FR-038)", async () => {
    const { handler, transactions } = payHandler({
      repo: fakeRepo({ findOne: vi.fn().mockResolvedValue(makePlan({ cardId: "c1" })) }),
      cards: fakeCardAccountRepo({ kindForCard: vi.fn(async () => "DEBIT" as const) }),
    });
    await handler.execute(command());

    expect(transactions.createWithTx).toHaveBeenCalled();
  });
});

describe("UnpayInstallmentHandler", () => {
  function unpayHandler(
    plan: InstallmentPlan,
    transactions = fakeTransactionWriterRepo(),
    cards = fakeCardAccountRepo(),
  ) {
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(plan) });
    const accounts = fakeBankAccountRepo();
    const handler = new UnpayInstallmentHandler(
      { publish: vi.fn() } as never,
      fakePrisma,
      repo,
      accounts,
      cards,
      transactions,
    );
    return { handler, repo, accounts, transactions };
  }

  // Spec 014, FR-021/FR-022a: symmetric with the pay-side refusal. An instalment on
  // a CREDIT-card plan is never individually paid, so it must never be individually
  // "unpaid" either — the only way it becomes PAID is a statement settling it, and
  // undoing THAT belongs to correcting the statement's payment, not this endpoint.
  it("refuses to unpay an instalment on a CREDIT-card plan (FR-022a)", async () => {
    const plan = makePlan({ cardId: "c1" });
    const { handler } = unpayHandler(
      plan,
      fakeTransactionWriterRepo(),
      fakeCardAccountRepo({ kindForCard: vi.fn(async () => "CREDIT" as const) }),
    );
    await expect(
      handler.execute(new UnpayInstallmentCommand("u1", "p1", 1)),
    ).rejects.toBeInstanceOf(InstallmentCardIsCreditError);
  });

  it("still unpays normally for a debit-card plan", async () => {
    const plan = makePlan({ cardId: "c1" });
    plan.payInstallment(1, "400", new Date("2026-02-01"), "tx1");
    const { handler } = unpayHandler(
      plan,
      fakeTransactionWriterRepo({ accountIdForTransaction: vi.fn(async () => "acc9") }),
      fakeCardAccountRepo({ kindForCard: vi.fn(async () => "DEBIT" as const) }),
    );
    await expect(
      handler.execute(new UnpayInstallmentCommand("u1", "p1", 1)),
    ).resolves.not.toThrow();
  });

  it("throws when the plan is not the user's", async () => {
    const { handler } = unpayHandler(makePlan());
    const repo = fakeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    const h = new UnpayInstallmentHandler(
      { publish: vi.fn() } as never,
      fakePrisma,
      repo,
      fakeBankAccountRepo(),
      fakeCardAccountRepo(),
      fakeTransactionWriterRepo(),
    );
    expect(handler).toBeDefined();
    await expect(h.execute(new UnpayInstallmentCommand("u1", "ghost", 1))).rejects.toBeInstanceOf(
      InstallmentPlanNotFoundError,
    );
  });

  it("deletes the expense and gives the balance back to the account it came from", async () => {
    const plan = makePlan();
    plan.payInstallment(1, "400", new Date("2026-02-01"), "tx1");
    const transactions = fakeTransactionWriterRepo({
      accountIdForTransaction: vi.fn(async () => "acc9"),
    });
    const { handler, accounts } = unpayHandler(plan, transactions);

    await handler.execute(new UnpayInstallmentCommand("u1", "p1", 1));

    expect(transactions.deleteWithTx).toHaveBeenCalledWith(expect.anything(), "tx1");
    // "acc9", the account the EXPENSE came from — not the plan's remembered "acc1",
    // which may have been changed since.
    expect(accounts.incrementBalanceWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "acc9",
      "400.0000",
    );
  });

  it("touches no balance for a legacy row that has no recorded amount", async () => {
    const plan = InstallmentPlan.fromPersistence({
      ...makePlan().snapshot(),
      payments: [
        {
          id: "pay1",
          sequence: 1,
          dueDate: new Date("2026-01-15"),
          amount: "400",
          paidAt: new Date("2026-01-16"),
          paidAmount: null,
          carriedOverAmount: "0.0000",
          transactionId: null,
          creditStatementId: null,
        },
      ],
    });
    const { handler, accounts, transactions } = unpayHandler(plan);

    await handler.execute(new UnpayInstallmentCommand("u1", "p1", 1));

    expect(transactions.deleteWithTx).not.toHaveBeenCalled();
    expect(accounts.incrementBalanceWithTx).not.toHaveBeenCalled();
  });
});
