import { describe, expect, it, vi } from "vitest";

import { CreateInstallmentPlanCommand } from "../../../../../../src/domains/installment-plan/application/commands/create-installment-plan.command";
import { CreateInstallmentPlanHandler } from "../../../../../../src/domains/installment-plan/application/commands/create-installment-plan.handler";
import { InstallmentCardIsCreditError } from "../../../../../../src/domains/installment-plan/domain/errors";
import { InstallmentPlan } from "../../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import type { InstallmentPlanRepositoryPort } from "../../../../../../src/domains/installment-plan/domain/ports/installment-plan.repository.port";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeCardAccountRepo,
  fakeIdempotencyRecordRepo,
} from "../../../../support/fake-ports";

/** Every scenario needs SOME key; only its stability across calls matters
 * elsewhere (see `useIdempotencyKey.test.ts` on the web side). */
function cmd(
  input: ConstructorParameters<typeof CreateInstallmentPlanCommand>[1],
): CreateInstallmentPlanCommand {
  return new CreateInstallmentPlanCommand("u1", input, "test-key-0000000000001");
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

/** `$transaction(cb)` just runs the callback: these tests are about WHAT is written.
 * Real atomicity is covered by the integration tier. */
function fakePrisma() {
  return { $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})) };
}

function makeHandler(
  repo: InstallmentPlanRepositoryPort,
  opts: { cardKind?: "CREDIT" | "DEBIT" | "PREPAID" | null; accountId?: string | null } = {},
) {
  const createWithTx = vi.fn();
  const incrementCreditUsedWithTx = vi.fn();
  const incrementBalanceWithTx = vi.fn();
  const handler = new CreateInstallmentPlanHandler(
    { publish: vi.fn() } as never,
    fakeIdempotencyRecordRepo(),
    repo,
    fakeCardAccountRepo({
      kindForCard: vi.fn(async () => opts.cardKind ?? null),
      accountIdForCard: vi.fn(async () => (opts.accountId === undefined ? "acc1" : opts.accountId)),
    }),
    { createWithTx, relinkToStatementWithTx: vi.fn(), updateAmountWithTx: vi.fn() } as never,
    fakeBankAccountRepo({
      incrementCreditUsedWithTx,
      incrementBalanceWithTx,
      findById: vi.fn(async () => accountAggregate({ id: "a1", type: "CHECKING" })),
    }),
    fakePrisma() as never,
  );
  return { handler, createWithTx, incrementCreditUsedWithTx, incrementBalanceWithTx };
}

/** The movements written by one `execute`, as this suite wants to assert on them. */
function movementsOf(createWithTx: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return createWithTx.mock.calls.map((c) => c[1] as Record<string, unknown>);
}

/** A `createWithTx` that echoes the planned schedule back as a persisted aggregate. */
function persistedPlan() {
  return vi.fn().mockImplementation(async (_tx: unknown, userId: string, plan) =>
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
      category: plan.category ?? null,
      paymentAccountId: plan.paymentAccountId ?? null,
      notes: plan.notes,
      payments: plan.payments.map(
        (p: { sequence: number; dueDate: Date; amount: string }, i: number) => ({
          id: `pay${i}`,
          sequence: p.sequence,
          dueDate: p.dueDate,
          amount: p.amount,
          paidAt: null,
          paidAmount: null,
          carriedOverAmount: "0.0000",
          transactionId: null,
          creditStatementId: null,
        }),
      ),
      createdAt: plan.startDate,
      updatedAt: plan.startDate,
    }),
  );
}

/** The worked example from the spec: 1.080.000 in 12 × 90.000, no interest. */
const CREDIT_PLAN = {
  title: "Notebook ASUS",
  totalPrincipal: "1080000",
  installmentCount: 12,
  startDate: "2026-03-05T00:00:00.000Z",
  currency: "CLP",
  frequency: "MONTHLY" as const,
  frequencyInterval: 1,
  cardId: "cCredit",
};

describe("CreateInstallmentPlanHandler", () => {
  it("generates the schedule and persists it via the repository", async () => {
    const createWithTx = persistedPlan();
    const { handler } = makeHandler(fakeRepo({ createWithTx }));

    const result = await handler.execute(
      cmd({
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
    expect(createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({ title: "Laptop", installmentCount: 3 }),
    );
  });

  // FR-037 / INV-P2: a CREDIT-card plan records no movement when an instalment is
  // paid, so remembering an account to pay it from promises something that will
  // never happen.
  it("refuses a payment account on a plan bought with a CREDIT card", async () => {
    const createWithTx = vi.fn();
    const { handler } = makeHandler(fakeRepo({ createWithTx }), { cardKind: "CREDIT" });
    await expect(
      handler.execute(cmd({ ...CREDIT_PLAN, paymentAccountId: "a1" })),
    ).rejects.toBeInstanceOf(InstallmentCardIsCreditError);
    expect(createWithTx).not.toHaveBeenCalled();
  });

  it("passes category and payment account through to the repository", async () => {
    const createWithTx = persistedPlan();
    const { handler } = makeHandler(fakeRepo({ createWithTx }));
    await handler.execute(
      cmd({
        title: "Sofá",
        totalPrincipal: "300",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        category: "Hogar",
        paymentAccountId: "a1",
      }),
    );
    expect(createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({ category: "Hogar", paymentAccountId: "a1" }),
    );
  });

  // --- spec 014: the purchase movement (FR-001, FR-002, FR-003) ---

  describe("the purchase movement of a CREDIT-card plan", () => {
    it("records one expense for the WHOLE principal, on the card's account, dated the plan's start", async () => {
      const { handler, createWithTx } = makeHandler(fakeRepo({ createWithTx: persistedPlan() }), {
        cardKind: "CREDIT",
        accountId: "accCredit",
      });

      await handler.execute(cmd(CREDIT_PLAN));

      const movements = movementsOf(createWithTx);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        bankAccountId: "accCredit",
        type: "EXPENSE",
        // The full commitment, NOT one instalment: the issuer reserves it all on
        // purchase day (FR-002).
        amount: "1080000.0000",
        currency: "CLP",
        cardId: "cCredit",
        // FR-003: what marks it as a plan's purchase, and what excludes it from any
        // period's total (FR-007).
        installmentPlanId: "p1",
      });
      expect(movements[0].occurredAt).toEqual(new Date("2026-03-05T00:00:00.000Z"));
    });

    it("consumes the account's credit pool by the full principal", async () => {
      const { handler, incrementCreditUsedWithTx } = makeHandler(
        fakeRepo({ createWithTx: persistedPlan() }),
        { cardKind: "CREDIT", accountId: "accCredit" },
      );

      await handler.execute(cmd(CREDIT_PLAN));

      expect(incrementCreditUsedWithTx).toHaveBeenCalledWith(
        expect.anything(),
        "accCredit",
        "1080000.0000",
      );
    });

    // FR-002a: a charge against a credit line takes no cash out. The money leaves
    // once, later, when the statement is paid.
    it("moves no cash balance on any account", async () => {
      const { handler, incrementBalanceWithTx } = makeHandler(
        fakeRepo({ createWithTx: persistedPlan() }),
        { cardKind: "CREDIT", accountId: "accCredit" },
      );

      await handler.execute(cmd(CREDIT_PLAN));

      expect(incrementBalanceWithTx).not.toHaveBeenCalled();
    });

    // FR-004: the purchase carries the PRICE; the interest is a separate charge of
    // the issuer's. Both consume the pool, neither is folded into the other.
    it("records the interest as its own charge, without an installmentPlanId", async () => {
      const { handler, createWithTx, incrementCreditUsedWithTx } = makeHandler(
        fakeRepo({ createWithTx: persistedPlan() }),
        { cardKind: "CREDIT", accountId: "accCredit" },
      );

      await handler.execute(
        cmd({
          ...CREDIT_PLAN,
          totalPrincipal: "1200",
          installmentCount: 3,
          aprPerPeriod: "10",
        }),
      );

      const movements = movementsOf(createWithTx);
      expect(movements).toHaveLength(2);

      const purchase = movements.find((m) => m.installmentPlanId === "p1");
      const interest = movements.find((m) => m.financeCharge === true);
      expect(purchase?.amount).toBe("1200.0000");
      // The interest charge must NOT carry the plan id: it is an ordinary period
      // charge and has to keep billing in the month it happened (research.md R4).
      expect(interest?.installmentPlanId).toBeUndefined();
      expect(interest?.cardId).toBeUndefined();

      // The pool takes both, separately — never the principal twice, never the
      // interest folded into it.
      const charged = incrementCreditUsedWithTx.mock.calls.map((c) => c[2] as string);
      expect(charged).toHaveLength(2);
      expect(charged).toContain("1200.0000");
    });
  });

  // --- spec 014: FR-005, the regression guard for every other kind of plan ---

  describe("a plan that is NOT on a credit card", () => {
    it.each([
      ["a DEBIT card", "DEBIT" as const],
      ["a PREPAID card", "PREPAID" as const],
      ["no card at all", null],
    ])("records no purchase movement and moves no pool with %s", async (_label, cardKind) => {
      const { handler, createWithTx, incrementCreditUsedWithTx } = makeHandler(
        fakeRepo({ createWithTx: persistedPlan() }),
        { cardKind },
      );

      await handler.execute(
        cmd({
          ...CREDIT_PLAN,
          cardId: cardKind === null ? undefined : "cSome",
        }),
      );

      expect(movementsOf(createWithTx)).toHaveLength(0);
      expect(incrementCreditUsedWithTx).not.toHaveBeenCalled();
    });
  });
});
