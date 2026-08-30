import { describe, expect, it, vi } from "vitest";

import { toPlanDtos } from "../../../../../src/domains/installment-plan/application/plan-dto.mapper";
import { InstallmentPlan } from "../../../../../src/domains/installment-plan/domain/installment-plan.aggregate";
import {
  accountAggregate,
  fakeBankAccountRepo,
  fakeCardAccountRepo,
} from "../../../support/fake-ports";

/**
 * Spec 014, FR-009a/FR-023a — `billingWarning` on the plan DTO. The list and
 * detail queries share this derivation (`toPlanDtos`) so the two can never
 * disagree about why a plan's instalments aren't reaching a statement.
 */

function plan(over: { cardId?: string | null; currency?: string; billed?: boolean } = {}) {
  return InstallmentPlan.fromPersistence({
    id: "pl1",
    userId: "u1",
    title: "Notebook",
    totalPrincipal: "90000",
    installmentCount: 1,
    startDate: new Date("2026-01-05"),
    currency: over.currency ?? "CLP",
    frequency: "MONTHLY",
    frequencyInterval: 1,
    cardId: over.cardId === undefined ? "c1" : over.cardId,
    category: null,
    paymentAccountId: null,
    notes: null,
    payments: [
      {
        id: "p1",
        sequence: 1,
        dueDate: new Date("2026-02-05"),
        amount: "90000",
        paidAt: null,
        paidAmount: null,
        carriedOverAmount: "0.0000",
        transactionId: null,
        creditStatementId: over.billed ? "st_1" : null,
      },
    ],
    createdAt: new Date("2026-01-05"),
    updatedAt: new Date("2026-01-05"),
  });
}

describe("toPlanDtos billingWarning", () => {
  it("is null for a plan not bought with a credit card", async () => {
    const cards = fakeCardAccountRepo({ kindForCard: vi.fn(async () => "DEBIT" as const) });
    const accounts = fakeBankAccountRepo();
    const [dto] = await toPlanDtos([plan()], "u1", cards, accounts);
    expect(dto!.billingWarning).toBeNull();
  });

  it("is null for a credit-card plan whose account has a billing day and matching currency", async () => {
    const cards = fakeCardAccountRepo({
      kindForCard: vi.fn(async () => "CREDIT" as const),
      accountIdForCard: vi.fn(async () => "acc1"),
    });
    const account = accountAggregate({
      id: "acc1",
      type: "CREDIT_CARD",
      currency: "CLP",
      billingCycleDay: 5,
    });
    const accounts = fakeBankAccountRepo({ findById: vi.fn(async () => account) });
    const [dto] = await toPlanDtos([plan()], "u1", cards, accounts);
    expect(dto!.billingWarning).toBeNull();
  });

  it("is NO_BILLING_DAY when the card's account has none configured", async () => {
    const cards = fakeCardAccountRepo({
      kindForCard: vi.fn(async () => "CREDIT" as const),
      accountIdForCard: vi.fn(async () => "acc1"),
    });
    const account = accountAggregate({
      id: "acc1",
      type: "CREDIT_CARD",
      currency: "CLP",
      billingCycleDay: null,
    });
    const accounts = fakeBankAccountRepo({ findById: vi.fn(async () => account) });
    const [dto] = await toPlanDtos([plan()], "u1", cards, accounts);
    expect(dto!.billingWarning).toBe("NO_BILLING_DAY");
  });

  it("is CURRENCY_MISMATCH when the plan and the card's account differ", async () => {
    const cards = fakeCardAccountRepo({
      kindForCard: vi.fn(async () => "CREDIT" as const),
      accountIdForCard: vi.fn(async () => "acc1"),
    });
    const account = accountAggregate({
      id: "acc1",
      type: "CREDIT_CARD",
      currency: "USD",
      billingCycleDay: 5,
    });
    const accounts = fakeBankAccountRepo({ findById: vi.fn(async () => account) });
    const [dto] = await toPlanDtos([plan({ currency: "CLP" })], "u1", cards, accounts);
    expect(dto!.billingWarning).toBe("CURRENCY_MISMATCH");
  });

  // FR-023a's third case: the card was deleted (`SetNull` on the FK), so the plan's
  // OWN cardId reverted to null — but it once billed an instalment, which only ever
  // happens for a credit-card plan. That is the only signal left that it lost one.
  it("is CARD_REMOVED for an orphaned plan that had already billed an instalment", async () => {
    const cards = fakeCardAccountRepo();
    const accounts = fakeBankAccountRepo();
    const [dto] = await toPlanDtos([plan({ cardId: null, billed: true })], "u1", cards, accounts);
    expect(dto!.billingWarning).toBe("CARD_REMOVED");
  });

  it("is null for a genuine no-card plan (a bank loan) that never billed anything", async () => {
    const cards = fakeCardAccountRepo();
    const accounts = fakeBankAccountRepo();
    const [dto] = await toPlanDtos([plan({ cardId: null, billed: false })], "u1", cards, accounts);
    expect(dto!.billingWarning).toBeNull();
  });
});
