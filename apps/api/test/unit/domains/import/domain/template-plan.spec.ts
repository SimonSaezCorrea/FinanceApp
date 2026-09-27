import { describe, expect, it } from "vitest";

import { imports } from "@finance/contracts";

import { TemplateRowRejectedError } from "../../../../../src/domains/import/domain/errors";
import {
  planTemplateImport,
  type TemplateAccount,
  type TemplateCard,
  type TemplateLookup,
} from "../../../../../src/domains/import/domain/template-plan";
import type { AccountContext } from "../../../../../src/domains/transaction/domain/movement-policy";

// Ids only need to be distinct inside the planner; UUIDs matter at the edge.
const BCI = "acc-bci";
const MACH = "acc-mach";
const TC = "acc-tc";
const PREPAID = "acc-prepaid";
const INACTIVE = "acc-old";
const PRIMARY = "card-primary";
const DEBIT = "card-debit";

function ctx(id: string, over: Partial<AccountContext> = {}): AccountContext {
  return {
    id,
    type: "CHECKING",
    currentBalance: "1000000",
    overdraftLimit: "0",
    balanceCeiling: null,
    creditLimit: "0",
    creditUsed: "0",
    billingCycleDay: null,
    billingCycleType: "BUSINESS_DAY",
    ...over,
  };
}

function account(
  id: string,
  over: Partial<AccountContext> = {},
  extra: Partial<TemplateAccount> = {},
): [string, TemplateAccount] {
  return [id, { context: ctx(id, over), currency: "CLP", status: "ACTIVE", ...extra }];
}

const noUsage = { income: "0", expense: "0" };
const cards: [string, TemplateCard][] = [
  [
    PRIMARY,
    {
      id: PRIMARY,
      kind: "CREDIT",
      isPrimary: true,
      limit: null,
      usage: noUsage,
      accountId: TC,
      // The CLP card's own USD limit.
      otherLimits: { USD: { limit: { limitAmount: "100", usedInitial: "0" }, usage: noUsage } },
    },
  ],
  [
    DEBIT,
    {
      id: DEBIT,
      kind: "DEBIT",
      isPrimary: false,
      limit: null,
      usage: noUsage,
      accountId: BCI,
      otherLimits: {},
    },
  ],
];

function lookup(over: Partial<TemplateLookup> = {}): TemplateLookup {
  return {
    accounts: new Map([
      account(BCI),
      account(MACH, { type: "SIGHT", currentBalance: "0" }),
      account(TC, { type: "CREDIT_CARD", currentBalance: "0", creditLimit: "2000000" }),
      account(PREPAID, { type: "PREPAID", currentBalance: "10000" }),
      account(INACTIVE, {}, { status: "INACTIVE" }),
    ]),
    cards: new Map(cards),
    categoryErrors: new Map(),
    ...over,
  };
}

let counter = 0;
const options = (mode: "collect" | "throw" = "collect") => ({
  mode,
  newId: () => `id-${++counter}`,
  now: new Date("2026-09-26T00:00:00Z"),
});

const date = (d: string) => `${d}T00:00:00.000Z`;
/** The request as the API sees it after validation: every sheet present. */
const req = (input: Partial<imports.TemplateImportRequest>): imports.TemplateImportRequest =>
  ({
    balanceModes: [],
    ...Object.fromEntries(imports.TEMPLATE_SHEET_KEYS.map((k) => [k, []])),
    ...input,
  }) as imports.TemplateImportRequest;

const movement = (
  over: Partial<imports.TemplateMovement> & { row: number },
): imports.TemplateMovement => ({
  occurredAt: date("2026-01-10"),
  type: "EXPENSE",
  amount: "1000",
  bankAccountId: BCI,
  ...over,
});

const codes = (result: ReturnType<typeof planTemplateImport>) =>
  result.issues.map((i) => `${i.sheet}:${i.row}:${i.code}`);
const effect = (result: ReturnType<typeof planTemplateImport>, id: string) =>
  result.accounts.find((a) => a.accountId === id)!;

describe("planTemplateImport — core", () => {
  it("counts rows per sheet and sums each account's effect", () => {
    const result = planTemplateImport(
      req({
        movements: [
          movement({ row: 2, type: "INCOME", amount: "50000" }),
          movement({ row: 3, amount: "20000" }),
        ],
      }),
      lookup(),
      options(),
    );
    expect(result.counts.movements).toBe(2);
    expect(result.counts.debts).toBe(0);
    expect(result.issues).toEqual([]);
    expect(Number(effect(result, BCI).netCash)).toBe(30000);
  });

  it("INCLUDED (the default) keeps today's balance; ADD moves it", () => {
    const rows = { movements: [movement({ row: 2, amount: "20000" })] };
    const included = planTemplateImport(req(rows), lookup(), options());
    expect(effect(included, BCI).mode).toBe("INCLUDED");
    expect(Number(effect(included, BCI).balanceAfter)).toBe(1000000);

    const added = planTemplateImport(
      req({ ...rows, balanceModes: [{ accountId: BCI, mode: "ADD" }] }),
      lookup(),
      options(),
    );
    expect(Number(effect(added, BCI).balanceAfter)).toBe(980000);
  });

  it("with INCLUDED, the rules replay from the opening balance, not today's", () => {
    // Today the prepaid holds 10.000 and the history spent 8.000 of an earlier
    // 18.000: replaying from today's figure would refuse the second expense.
    const history = {
      movements: [
        movement({
          row: 2,
          bankAccountId: PREPAID,
          type: "INCOME",
          amount: "8000",
          occurredAt: date("2026-01-01"),
        }),
        movement({
          row: 3,
          bankAccountId: PREPAID,
          amount: "9000",
          occurredAt: date("2026-01-02"),
        }),
        movement({
          row: 4,
          bankAccountId: PREPAID,
          amount: "7000",
          occurredAt: date("2026-01-03"),
        }),
      ],
    };
    // Opening = 10.000 − (8.000 − 16.000) = 18.000 → 26.000 → 17.000 → 10.000.
    expect(planTemplateImport(req(history), lookup(), options()).issues).toEqual([]);
    // Adding on top of today's 10.000: 18.000 → 9.000 → 2.000… still fine;
    // a larger one breaks.
    const breaking = planTemplateImport(
      req({
        ...history,
        movements: [
          ...history.movements,
          movement({
            row: 5,
            bankAccountId: PREPAID,
            amount: "5000",
            occurredAt: date("2026-01-04"),
          }),
        ],
        balanceModes: [{ accountId: PREPAID, mode: "ADD" }],
      }),
      lookup(),
      options(),
    );
    expect(codes(breaking)).toEqual(["movements:5:PREPAID_INSUFFICIENT_BALANCE"]);
  });

  it("validates in DATE order across sheets, not in file order", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: PREPAID, mode: "ADD" }],
        movements: [
          // Listed first but happens after the top-up.
          movement({
            row: 2,
            bankAccountId: PREPAID,
            amount: "15000",
            occurredAt: date("2026-02-01"),
          }),
        ],
        transfers: [
          {
            row: 2,
            occurredAt: date("2026-01-15"),
            fromAccountId: BCI,
            toAccountId: PREPAID,
            outgoingAmount: "10000",
            incomingAmount: "10000",
          },
        ],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
  });

  it("collects every issue in preview and throws on the first one in commit", () => {
    const input = req({
      movements: [
        movement({ row: 2, bankAccountId: "acc-foreign" }),
        movement({ row: 3, bankAccountId: INACTIVE }),
      ],
    });
    expect(codes(planTemplateImport(input, lookup(), options()))).toEqual([
      "movements:2:ACCOUNT_NOT_FOUND",
      "movements:3:IMPORT_ACCOUNT_INACTIVE",
    ]);
    expect(() => planTemplateImport(input, lookup(), options("throw"))).toThrow(
      TemplateRowRejectedError,
    );
    try {
      planTemplateImport(input, lookup(), options("throw"));
    } catch (e) {
      expect((e as TemplateRowRejectedError).field).toBe("movements.2");
      expect((e as TemplateRowRejectedError).httpStatus).toBe(404);
    }
  });
});

describe("planTemplateImport — movements and transfers (US2)", () => {
  it("a CREDIT card expense moves the pool, not the cash; the primary card is implied", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: TC, mode: "ADD" }],
        movements: [movement({ row: 2, bankAccountId: TC, amount: "30000" })],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(Number(effect(result, TC).netCash)).toBe(0);
    expect(Number(effect(result, TC).netCredit)).toBe(30000);
    expect(result.movements[0]!.cardId).toBe(PRIMARY);
    expect(result.movements[0]!.drawsOnCredit).toBe(true);
    expect(result.movements[0]!.statementCurrency).toBe("CLP");
  });

  it("refuses a card of another account, and an expense over the credit limit", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: TC, mode: "ADD" }],
        movements: [
          movement({ row: 2, cardId: PRIMARY }),
          movement({ row: 3, bankAccountId: TC, amount: "2500000" }),
          movement({ row: 4, cardId: "card-foreign" }),
        ],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual([
      "movements:2:CARD_ACCOUNT_MISMATCH",
      "movements:4:CARD_NOT_FOUND",
      "movements:3:CARD_LIMIT_EXCEEDED",
    ]);
  });

  it("a foreign-currency charge and its payment go against the card's own USD limit, never the pool", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: TC, mode: "ADD" }],
        movements: [
          movement({ row: 2, bankAccountId: TC, amount: "80", currency: "USD" }),
          movement({ row: 3, bankAccountId: TC, type: "INCOME", amount: "70", currency: "USD" }),
          // Room again after the payment: 80 − 70 + 60 = 70 ≤ 100.
          movement({ row: 4, bankAccountId: TC, amount: "60", currency: "USD" }),
        ],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(Number(effect(result, TC).netCredit)).toBe(0);
    // Spec 028: never the CLP pool — but every row belongs to the OPEN USD period.
    expect(
      result.movements.map((m) => [m.currency, m.cardId, m.drawsOnCredit, m.statementCurrency]),
    ).toEqual([
      ["USD", PRIMARY, false, "USD"],
      ["USD", PRIMARY, false, "USD"],
      ["USD", PRIMARY, false, "USD"],
    ]);
  });

  it("caps foreign-currency charges by that limit, and refuses a currency with no limit", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: TC, mode: "ADD" }],
        movements: [
          movement({ row: 2, bankAccountId: TC, amount: "150", currency: "USD" }),
          movement({ row: 3, bankAccountId: TC, amount: "1", currency: "CLF" }),
          movement({ row: 4, amount: "10", currency: "USD" }),
        ],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual([
      "movements:3:IMPORT_CURRENCY_MISMATCH",
      "movements:4:IMPORT_CURRENCY_MISMATCH",
      "movements:2:CARD_SUBLIMIT_EXCEEDED",
    ]);
  });

  it("refuses a category the loader flagged for that movement type", () => {
    const result = planTemplateImport(
      req({ movements: [movement({ row: 2, categoryId: "cat-salary" })] }),
      lookup({
        categoryErrors: new Map([
          ["cat-salary|EXPENSE", { code: "CATEGORY_NOT_ALLOWED", status: 400 }],
        ]),
      }),
      options(),
    );
    expect(codes(result)).toEqual(["movements:2:CATEGORY_NOT_ALLOWED"]);
  });

  it("a transfer writes two legs sharing a group and moves both cash balances", () => {
    const result = planTemplateImport(
      req({
        transfers: [
          {
            row: 2,
            occurredAt: date("2026-03-01"),
            fromAccountId: BCI,
            toAccountId: MACH,
            outgoingAmount: "40000",
            incomingAmount: "40000",
          },
        ],
      }),
      lookup(),
      options(),
    );
    expect(result.movements).toHaveLength(2);
    const [out, inn] = result.movements;
    expect(out!.transferGroupId).toBe(inn!.transferGroupId);
    expect(out!.transferGroupId).not.toBeNull();
    expect(Number(effect(result, BCI).netCash)).toBe(-40000);
    expect(Number(effect(result, MACH).netCash)).toBe(40000);
  });

  it("refuses a transfer INTO a credit card account", () => {
    const result = planTemplateImport(
      req({
        transfers: [
          {
            row: 2,
            occurredAt: date("2026-03-01"),
            fromAccountId: BCI,
            toAccountId: TC,
            outgoingAmount: "1",
            incomingAmount: "1",
          },
        ],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual(["transfers:2:TRANSFER_TO_CREDIT_ACCOUNT"]);
  });
});

const victor = (over: Partial<imports.TemplateDebt> = {}): imports.TemplateDebt => ({
  row: 2,
  ref: "VICTOR",
  direction: "OWED_TO_YOU",
  counterparty: "Victor",
  principal: "200000",
  currency: "CLP",
  openedAt: date("2026-02-14"),
  totalInstallments: 4,
  frequency: "MONTHLY",
  frequencyInterval: 1,
  ...over,
});
const debtPayment = (row: number, d: string, over: Partial<imports.TemplateDebtPayment> = {}) => ({
  row,
  debtRef: "victor ",
  paidAt: date(d),
  accountId: BCI,
  ...over,
});

describe("planTemplateImport — debts (US3)", () => {
  it("Victor: creating the debt moves nothing; three payments are three incomes", () => {
    const result = planTemplateImport(
      req({
        debts: [victor()],
        debtPayments: [
          debtPayment(2, "2026-03-14"),
          debtPayment(3, "2026-04-14"),
          debtPayment(4, "2026-05-14", { amount: "50000" }),
        ],
        balanceModes: [{ accountId: BCI, mode: "ADD" }],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(result.debts[0]!.payments.map((p) => Number(p.amount))).toEqual([50000, 50000, 50000]);
    expect(result.movements.every((m) => m.type === "INCOME" && m.systemCategory === "DEBTS")).toBe(
      true,
    );
    expect(result.movements.map((m) => m.link)).toEqual(Array(3).fill({ kind: "debt", index: 0 }));
    expect(Number(effect(result, BCI).netCash)).toBe(150000);
  });

  it("a debt YOU owe pays out; a debt fully paid is left settled", () => {
    const result = planTemplateImport(
      req({
        debts: [victor({ direction: "YOU_OWE", totalInstallments: 1 })],
        debtPayments: [debtPayment(2, "2026-03-01")],
      }),
      lookup(),
      options(),
    );
    expect(result.movements[0]!.type).toBe("EXPENSE");
    expect(Number(effect(result, BCI).netCash)).toBe(-200000);
  });

  it("refuses a wrong amount, too many payments, an unknown or duplicate ref, a payment before the debt and one from a credit card", () => {
    const result = planTemplateImport(
      req({
        debts: [victor({ totalInstallments: 1 }), victor({ row: 3 })],
        debtPayments: [
          debtPayment(2, "2026-01-01"),
          debtPayment(3, "2026-03-01", { amount: "1" }),
          debtPayment(4, "2026-03-02"),
          debtPayment(5, "2026-03-03"),
          debtPayment(6, "2026-03-04", { debtRef: "NOBODY" }),
          debtPayment(7, "2026-03-05", { accountId: TC }),
        ],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual([
      "debts:3:IMPORT_DUPLICATE_REF",
      "debtPayments:2:IMPORT_PAYMENT_BEFORE_START",
      "debtPayments:3:IMPORT_PAYMENT_AMOUNT_MISMATCH",
      "debtPayments:5:IMPORT_TOO_MANY_PAYMENTS",
      "debtPayments:6:IMPORT_UNKNOWN_REF",
      "debtPayments:7:DEBT_PAYMENT_FROM_CREDIT_ACCOUNT",
    ]);
  });
});

const notebook = (over: Partial<imports.TemplatePlan> = {}): imports.TemplatePlan => ({
  row: 2,
  ref: "NOTEBOOK",
  title: "Notebook",
  startDate: date("2025-11-28"),
  totalPrincipal: "600000",
  installmentCount: 6,
  currency: "CLP",
  frequency: "MONTHLY",
  frequencyInterval: 1,
  cardId: PRIMARY,
  ...over,
});
const planPayment = (
  row: number,
  sequence: number,
  over: Partial<imports.TemplatePlanPayment> = {},
) => ({
  row,
  planRef: "NOTEBOOK",
  sequence,
  paidAt: date("2026-01-01"),
  ...over,
});

describe("planTemplateImport — instalment plans (US4)", () => {
  it("a credit plan's purchase takes the pool, paid instalments give their share back", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: TC, mode: "ADD" }],
        plans: [notebook()],
        planPayments: [1, 2, 3, 4].map((s) => planPayment(s + 1, s)),
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    // 600.000 bought − 4 × 100.000 settled outside the app.
    expect(Number(effect(result, TC).netCredit)).toBe(200000);
    expect(Number(effect(result, TC).netCash)).toBe(0);
    // Only the purchase is a movement; the paid instalments aren't.
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0]!.link).toEqual({ kind: "plan", index: 0 });
    expect(result.plans[0]!.payments).toHaveLength(4);
    expect(result.plans[0]!.payments.every((p) => p.transactionId === null)).toBe(true);
  });

  it("a credit plan's purchase is NOT checked against the limit (R12), and interest is its own charge", () => {
    const result = planTemplateImport(
      req({
        balanceModes: [{ accountId: TC, mode: "ADD" }],
        plans: [notebook({ totalPrincipal: "3000000", aprPerPeriod: "0.01" })],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(result.movements).toHaveLength(2);
    expect(result.movements[1]!.financeCharge).toBe(true);
    expect(result.movements[1]!.systemCategory).toBe("INTEREST");
    expect(Number(effect(result, TC).netCredit)).toBeGreaterThan(3000000);
  });

  it("a plan whose every instalment is paid is left fully paid (FR-019)", () => {
    const result = planTemplateImport(
      req({
        plans: [notebook({ installmentCount: 2, totalPrincipal: "200000" })],
        planPayments: [planPayment(2, 1), planPayment(3, 2)],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(result.plans[0]!.payments).toHaveLength(2);
  });

  it("a debit plan's payment is a real expense, with the plan's carry-over", () => {
    const result = planTemplateImport(
      req({
        plans: [notebook({ cardId: DEBIT, installmentCount: 3, totalPrincipal: "300000" })],
        planPayments: [
          planPayment(2, 1, { accountId: BCI, amount: "100000" }),
          planPayment(3, 2, { accountId: BCI, amount: "100000", paidAt: date("2026-02-01") }),
          planPayment(4, 3, { accountId: BCI, amount: "100000", paidAt: date("2026-03-01") }),
        ],
        balanceModes: [{ accountId: BCI, mode: "ADD" }],
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(result.movements.filter((m) => m.link?.kind === "plan")).toHaveLength(3);
    expect(Number(effect(result, BCI).netCash)).toBe(-300000);
  });

  it("refuses the wrong payment fields, a bad sequence and a payment from a credit account", () => {
    const result = planTemplateImport(
      req({
        plans: [notebook(), notebook({ row: 3, ref: "LOAN", cardId: undefined })],
        planPayments: [
          planPayment(2, 1, { accountId: BCI }),
          planPayment(3, 9),
          planPayment(4, 2),
          planPayment(5, 2),
          planPayment(6, 1, { planRef: "LOAN" }),
          planPayment(7, 1, { planRef: "LOAN", accountId: TC, amount: "100000" }),
        ],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual([
      "planPayments:2:IMPORT_PLAN_PAYMENT_FIELDS",
      "planPayments:6:IMPORT_PLAN_PAYMENT_FIELDS",
      "planPayments:7:INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT",
      "planPayments:5:IMPORT_INVALID_SEQUENCE",
      "planPayments:3:IMPORT_INVALID_SEQUENCE",
    ]);
  });
});

describe("planTemplateImport — recurring, goals and contributions (US5)", () => {
  it("a recurring series moves nothing; a contribution is an expense from its account", () => {
    const result = planTemplateImport(
      req({
        recurring: [
          {
            row: 2,
            label: "Spotify",
            amount: "6990",
            currency: "CLP",
            frequency: "MONTHLY",
            interval: 1,
            anchorDate: date("2026-01-05"),
            bankAccountId: BCI,
          },
        ],
        goals: [{ row: 2, ref: "VIAJE", title: "Viaje", targetAmount: "1000000", currency: "CLP" }],
        contributions: [
          {
            row: 2,
            goalRef: "viaje",
            contributedAt: date("2026-02-01"),
            amount: "50000",
            bankAccountId: BCI,
          },
          {
            row: 3,
            goalRef: "VIAJE",
            contributedAt: date("2026-03-01"),
            amount: "50000",
            bankAccountId: BCI,
          },
          {
            row: 4,
            goalRef: "OTRA",
            contributedAt: date("2026-03-01"),
            amount: "1",
            bankAccountId: BCI,
          },
        ],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual(["contributions:4:IMPORT_UNKNOWN_REF"]);
    expect(result.recurring).toHaveLength(1);
    expect(result.recurring[0]!.active).toBe(true);
    expect(result.goals[0]!.contributions).toHaveLength(2);
    expect(Number(effect(result, BCI).netCash)).toBe(-100000);
    expect(result.movements.every((m) => m.systemCategory === "SAVINGS")).toBe(true);
  });
});

describe("planTemplateImport — recurring with an end and its payments", () => {
  const spotify = (over: Partial<imports.TemplateRecurring> = {}): imports.TemplateRecurring => ({
    row: 2,
    ref: "SPOTIFY",
    label: "Spotify",
    amount: "6990",
    currency: "CLP",
    frequency: "MONTHLY",
    interval: 1,
    anchorDate: date("2026-01-01"),
    endDate: date("2026-04-01"),
    bankAccountId: BCI,
    ...over,
  });

  it("links each movement naming the series to it", () => {
    const result = planTemplateImport(
      req({
        recurring: [spotify()],
        movements: ["01", "02", "03", "04"].map((m, i) =>
          movement({
            row: i + 2,
            amount: "6990",
            occurredAt: date(`2026-${m}-01`),
            recurringRef: "spotify",
          }),
        ),
      }),
      lookup(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(result.recurring[0]!.endDate).toEqual(new Date("2026-04-01T00:00:00Z"));
    expect(result.movements.map((m) => m.link)).toEqual(
      Array(4).fill({ kind: "recurring", index: 0 }),
    );
  });

  it("refuses an unknown series and an end before the start", () => {
    const result = planTemplateImport(
      req({
        recurring: [spotify({ endDate: date("2025-12-01") })],
        movements: [movement({ row: 2, recurringRef: "NETFLIX" })],
      }),
      lookup(),
      options(),
    );
    expect(codes(result)).toEqual([
      "recurring:2:RECURRING_END_BEFORE_START",
      "movements:2:IMPORT_UNKNOWN_REF",
    ]);
  });
});
