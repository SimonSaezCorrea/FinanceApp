import { describe, expect, it } from "vitest";

import { imports } from "@finance/contracts";

import {
  planTemplateImport,
  type TemplateLookup,
} from "../../../../../src/domains/import/domain/template-plan";

// Template v2: accounts, cards and billing periods defined in the file itself.
const CHK = "tmp-checking";
const TC = "tmp-credit";
const CARD = "tmp-card-credit";
const EXTRA = "tmp-card-extra";
const DEBIT = "tmp-card-debit";

const empty = (): TemplateLookup => ({
  accounts: new Map(),
  cards: new Map(),
  categoryErrors: new Map(),
});

let counter = 0;
const options = () => ({
  mode: "collect" as const,
  newId: () => `id-${++counter}`,
  now: new Date("2026-10-07T12:00:00Z"),
});
const date = (d: string) => `${d}T00:00:00.000Z`;
const req = (input: Partial<imports.TemplateImportRequest>): imports.TemplateImportRequest =>
  ({
    mode: "REPLACE",
    balanceModes: [],
    ...Object.fromEntries(imports.TEMPLATE_SHEET_KEYS.map((k) => [k, []])),
    ...input,
  }) as imports.TemplateImportRequest;

const accounts: imports.TemplateAccount[] = [
  {
    row: 2,
    id: CHK,
    name: "BCI",
    type: "CHECKING",
    status: "ACTIVE",
    currency: "CLP",
    accountNumber: "123",
    openingBalance: "100000",
  },
  {
    row: 3,
    id: TC,
    name: "BCI Crédito",
    type: "CREDIT_CARD",
    status: "ACTIVE",
    currency: "CLP",
    openingBalance: "0",
    creditLimit: "900000",
    creditUsedInitial: "50000",
  },
];
const cards: imports.TemplateCard[] = [
  {
    row: 2,
    id: DEBIT,
    accountId: CHK,
    kind: "DEBIT",
    last4: "1111",
    expiryMonth: 1,
    expiryYear: 2030,
  },
  {
    row: 3,
    id: CARD,
    accountId: TC,
    kind: "CREDIT",
    last4: "7758",
    expiryMonth: 6,
    expiryYear: 2031,
    extraLimitCurrency: "USD",
    extraLimit: "100",
  },
  {
    row: 4,
    id: EXTRA,
    accountId: TC,
    kind: "CREDIT",
    last4: "7914",
    expiryMonth: 6,
    expiryYear: 2031,
    isAdditional: true,
    ownLimit: "500000",
  },
];
const codes = (r: ReturnType<typeof planTemplateImport>) =>
  r.issues.map((i) => `${i.sheet}:${i.row}:${i.code}`);
const effect = (r: ReturnType<typeof planTemplateImport>, id: string) =>
  r.accounts.find((a) => a.accountId === id)!;

describe("planTemplateImport — accounts and cards defined in the file", () => {
  it("creates them, resolves the primary card and plays the history from the opening balance", () => {
    const result = planTemplateImport(
      req({
        accounts,
        cards,
        movements: [
          {
            row: 2,
            occurredAt: date("2026-09-01"),
            type: "INCOME",
            amount: "20000",
            bankAccountId: CHK,
          },
          {
            row: 3,
            occurredAt: date("2026-09-02"),
            type: "EXPENSE",
            amount: "30000",
            bankAccountId: TC,
            cardId: CARD,
          },
          {
            row: 4,
            occurredAt: date("2026-09-03"),
            type: "EXPENSE",
            amount: "10",
            currency: "USD",
            bankAccountId: TC,
            cardId: CARD,
          },
        ],
      }),
      empty(),
      options(),
    );
    expect(result.issues).toEqual([]);
    expect(result.newAccounts.map((a) => a.tempId)).toEqual([CHK, TC]);
    const credit = result.newAccounts[1]!;
    expect(credit.plan.creditLimit).toBe("900000");
    expect(credit.plan.creditUsedInitial).toBe("50000");
    const [primary, additional] = credit.cards;
    expect(primary!.plan.isPrimary).toBe(true);
    // The primary's limit IS the account's line; only its USD limit is its own.
    expect(primary!.plan.limits.map((l) => l.currency)).toEqual(["USD"]);
    expect(additional!.plan.isPrimary).toBe(false);
    expect(additional!.plan.limits).toEqual([
      { currency: "CLP", limitAmount: "500000", usedInitial: "0" },
    ]);
    // A defined account always ADDs its history to its opening figures.
    expect(effect(result, CHK).mode).toBe("ADD");
    expect(Number(effect(result, CHK).balanceAfter)).toBe(120000);
    expect(Number(effect(result, TC).creditUsedAfter)).toBe(80000);
  });

  it("refuses what creating them by hand would refuse", () => {
    const result = planTemplateImport(
      req({
        accounts: [{ ...accounts[0]!, accountNumber: undefined }],
        cards: [
          { ...cards[1]!, accountId: "nowhere" },
          { ...cards[0]!, kind: "CREDIT", row: 5, accountId: CHK },
        ],
      }),
      empty(),
      options(),
    );
    expect(codes(result)).toEqual([
      "cards:3:IMPORT_UNKNOWN_REF",
      "accounts:2:ACCOUNT_NUMBER_REQUIRED",
    ]);
  });

  it("refuses two accounts with the same name", () => {
    const result = planTemplateImport(
      req({ accounts: [accounts[0]!, { ...accounts[0]!, row: 3, id: "other" }] }),
      empty(),
      options(),
    );
    expect(codes(result)).toEqual(["accounts:3:IMPORT_DUPLICATE_REF"]);
  });
});

describe("planTemplateImport — billing periods", () => {
  const period = (over: Partial<imports.TemplateStatement> & { row: number }) =>
    ({
      accountId: TC,
      periodStart: date("2026-08-20"),
      closedAt: "2026-09-17T23:59:59.999Z",
      dueDate: "2026-10-05T23:59:59.999Z",
      ...over,
    }) as imports.TemplateStatement;

  it("are only rebuilt when the file replaces everything", () => {
    const result = planTemplateImport(
      req({ mode: "MERGE", accounts, cards, statements: [period({ row: 2 })] }),
      empty(),
      options(),
    );
    expect(codes(result)).toEqual(["statements:2:IMPORT_STATEMENTS_REPLACE_ONLY"]);
  });

  it("must be on a credit card account and not overlap", () => {
    const result = planTemplateImport(
      req({
        accounts,
        cards,
        statements: [
          period({ row: 2 }),
          period({ row: 3, periodStart: date("2026-09-10"), closedAt: "2026-10-01T23:59:59.999Z" }),
          period({ row: 4, accountId: CHK }),
        ],
      }),
      empty(),
      options(),
    );
    expect(codes(result)).toEqual([
      "statements:4:IMPORT_STATEMENT_NOT_CREDIT",
      "statements:3:STATEMENT_PERIOD_OVERLAPS",
    ]);
  });

  it("paid from an account: an expense there and the card's pool down, like 'Pagar'", () => {
    const result = planTemplateImport(
      req({
        accounts,
        cards,
        statements: [
          period({
            row: 2,
            paidAt: date("2026-10-05"),
            paidAmount: "40000",
            paidFromAccountId: CHK,
          }),
        ],
      }),
      empty(),
      options(),
    );
    expect(result.issues).toEqual([]);
    const payment = result.movements.find((m) => m.systemCategory === "STATEMENT_PAYMENT")!;
    expect(payment).toMatchObject({ accountId: CHK, type: "EXPENSE", amount: "40000" });
    expect(result.statements[0]!.paymentTransactionId).toBe(payment.id);
    expect(Number(effect(result, CHK).balanceAfter)).toBe(60000);
    expect(Number(effect(result, TC).creditUsedAfter)).toBe(10000);
  });

  it("a foreign-currency period marked paid frees the card's limit in that currency", async () => {
    const charge = (row: number, day: string) => ({
      row,
      occurredAt: date(day),
      type: "EXPENSE" as const,
      amount: "70",
      currency: "USD",
      bankAccountId: TC,
      cardId: CARD,
    });
    const base = { accounts, cards, movements: [charge(2, "2026-08-01"), charge(3, "2026-09-10")] };

    // 70 + 70 against a 100 USD limit: the second charge is refused…
    const refused = planTemplateImport(req(base), empty(), options());
    expect(codes(refused)).toEqual(["movements:3:CARD_SUBLIMIT_EXCEEDED"]);

    // …unless the first period was settled before it (no amount: its own net, 70).
    const settled = planTemplateImport(
      req({
        ...base,
        statements: [
          {
            row: 2,
            accountId: TC,
            currency: "USD",
            periodStart: date("2026-07-25"),
            closedAt: "2026-08-20T23:59:59.999Z",
            dueDate: "2026-09-01T23:59:59.999Z",
            paidAt: date("2026-09-01"),
          },
        ],
      }),
      empty(),
      options(),
    );
    expect(settled.issues).toEqual([]);
    expect(settled.statements).toHaveLength(1);
    expect(settled.statements[0]).toMatchObject({ currency: "USD", paidFromAccountId: null });
  });
});
