import { describe, expect, it } from "vitest";

import type { imports } from "@finance/contracts";

import { planImport, type ImportCard } from "../../../../../src/domains/import/domain/import-plan";
import type { AccountContext } from "../../../../../src/domains/transaction/domain/movement-policy";

function account(over: Partial<AccountContext> = {}): AccountContext & { currency: string } {
  return {
    id: "acc",
    type: "CHECKING",
    currentBalance: "100000",
    overdraftLimit: "0",
    balanceCeiling: null,
    creditLimit: "0",
    creditUsed: "0",
    billingCycleDay: null,
    billingCycleType: "BUSINESS_DAY",
    currency: "CLP",
    ...over,
  };
}

const noUsage = { income: "0", expense: "0" };
const primary: ImportCard = {
  id: "card-primary",
  kind: "CREDIT",
  isPrimary: true,
  limit: null,
  usage: noUsage,
};

const row = (type: "INCOME" | "EXPENSE", amount: string): imports.ImportRow => ({
  type,
  amount,
  occurredAt: "2026-09-01T00:00:00.000Z",
  description: "  Jumbo  ",
});

describe("planImport", () => {
  it("adds every row's effect on the balance into one total", () => {
    const plan = planImport(
      [row("INCOME", "50000"), row("EXPENSE", "20000"), row("EXPENSE", "5000")],
      account(),
      [],
    );
    expect(Number(plan.cashTotal)).toBe(25000);
    expect(Number(plan.creditTotal)).toBe(0);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows[0]!.description).toBe("Jumbo");
    expect(plan.rows.every((r) => r.cardId === null && !r.drawsOnCredit)).toBe(true);
  });

  it("checks a prepaid balance against the RUNNING total, and names the failing row", () => {
    // Each expense alone fits in 10.000; the third one takes it below zero.
    expect(() =>
      planImport(
        [row("EXPENSE", "4000"), row("EXPENSE", "4000"), row("EXPENSE", "4000")],
        account({ type: "PREPAID", currentBalance: "10000" }),
        [],
      ),
    ).toThrow(expect.objectContaining({ code: "PREPAID_INSUFFICIENT_BALANCE", field: "rows.2" }));
  });

  it("lets an income earlier in the file fund a later expense on a prepaid account", () => {
    const plan = planImport(
      [row("INCOME", "20000"), row("EXPENSE", "25000")],
      account({ type: "PREPAID", currentBalance: "10000" }),
      [],
    );
    expect(Number(plan.cashTotal)).toBe(-5000);
  });

  it("charges a credit card account's expenses to its primary card and its pool, not its cash", () => {
    const plan = planImport(
      [row("EXPENSE", "30000"), row("INCOME", "10000")],
      account({ type: "CREDIT_CARD", currentBalance: "0", creditLimit: "500000" }),
      [primary],
    );
    expect(plan.rows[0]).toMatchObject({ cardId: "card-primary", drawsOnCredit: true });
    // A payment (income) on the credit account has no card, and frees the pool.
    expect(plan.rows[1]).toMatchObject({ cardId: null, drawsOnCredit: true });
    expect(Number(plan.creditTotal)).toBe(20000);
    expect(Number(plan.cashTotal)).toBe(0);
  });

  it("refuses to exceed the credit limit across rows", () => {
    expect(() =>
      planImport(
        [row("EXPENSE", "60000"), row("EXPENSE", "60000")],
        account({ type: "CREDIT_CARD", currentBalance: "0", creditLimit: "100000" }),
        [primary],
      ),
    ).toThrow(expect.objectContaining({ code: "CARD_LIMIT_EXCEEDED", field: "rows.1" }));
  });

  it("refuses an expense on a credit card account with no primary card to charge it to", () => {
    expect(() =>
      planImport(
        [row("EXPENSE", "1000")],
        account({ type: "CREDIT_CARD", currentBalance: "0", creditLimit: "100000" }),
        [],
      ),
    ).toThrow(expect.objectContaining({ code: "CARD_REQUIRED", field: "rows.0" }));
  });

  it("uses the card a row names, and refuses one that isn't this account's", () => {
    const debit: ImportCard = {
      id: "debit-1",
      kind: "DEBIT",
      isPrimary: false,
      limit: null,
      usage: noUsage,
    };
    const plan = planImport([{ ...row("EXPENSE", "1000"), cardId: "debit-1" }], account(), [debit]);
    expect(plan.rows[0]).toMatchObject({ cardId: "debit-1", drawsOnCredit: false });
    expect(Number(plan.cashTotal)).toBe(-1000);

    expect(() =>
      planImport([{ ...row("EXPENSE", "1000"), cardId: "foreign" }], account(), [debit]),
    ).toThrow(expect.objectContaining({ code: "CARD_ACCOUNT_MISMATCH", field: "rows.0" }));
  });

  it("keeps an additional card with its own sub-limit out of the shared pool, capped by its own", () => {
    const additional: ImportCard = {
      id: "additional",
      kind: "CREDIT",
      isPrimary: false,
      limit: { limitAmount: "50000", usedInitial: "0" },
      usage: { income: "0", expense: "40000" },
    };
    const creditAccount = account({
      type: "CREDIT_CARD",
      currentBalance: "0",
      creditLimit: "500000",
    });
    const plan = planImport([{ ...row("EXPENSE", "5000"), cardId: "additional" }], creditAccount, [
      primary,
      additional,
    ]);
    expect(Number(plan.creditTotal)).toBe(0);
    // 40.000 used + 5.000 + 6.000 goes past its own 50.000, on the running total.
    expect(() =>
      planImport(
        [
          { ...row("EXPENSE", "5000"), cardId: "additional" },
          { ...row("EXPENSE", "6000"), cardId: "additional" },
        ],
        creditAccount,
        [primary, additional],
      ),
    ).toThrow(expect.objectContaining({ code: "CARD_SUBLIMIT_EXCEEDED", field: "rows.1" }));
  });

  it("records an issuer charge on the account itself, with no card, drawing on the pool", () => {
    const plan = planImport(
      [{ ...row("EXPENSE", "3500"), financeCharge: true }],
      account({ type: "CREDIT_CARD", currentBalance: "0", creditLimit: "500000" }),
      [primary],
    );
    expect(plan.rows[0]).toMatchObject({ cardId: null, financeCharge: true, drawsOnCredit: true });
  });

  it("carries every detail field, trimmed, and empty ones as null", () => {
    const plan = planImport(
      [
        {
          ...row("EXPENSE", "1000"),
          observation: " boleta 123 ",
          emisor: "Javier",
          receptor: "Cencosud",
          lugar: "",
          categoryId: "cat-1",
        },
      ],
      account(),
      [],
    );
    expect(plan.rows[0]).toMatchObject({
      observation: "boleta 123",
      emisor: "Javier",
      receptor: "Cencosud",
      lugar: null,
      categoryId: "cat-1",
    });
  });
});
