import { describe, expect, it } from "vitest";

import {
  TEMPLATE_IMPORT_MAX_ROWS,
  templateImportRequestSchema,
  templatePlanPaymentSchema,
} from "./template";

const ACCOUNT = "01890a5d-ac96-774b-bcce-b302099a8057";
const OTHER = "01890a5d-ac96-774b-bcce-b302099a8058";
const DATE = "2026-01-15T00:00:00.000Z";

const movement = {
  row: 2,
  occurredAt: DATE,
  type: "EXPENSE" as const,
  amount: "1000",
  bankAccountId: ACCOUNT,
};

describe("templateImportRequestSchema", () => {
  it("accepts a minimal request with one row of each sheet", () => {
    const parsed = templateImportRequestSchema.safeParse({
      movements: [movement],
      transfers: [
        {
          row: 2,
          occurredAt: DATE,
          fromAccountId: ACCOUNT,
          toAccountId: OTHER,
          outgoingAmount: "500",
          incomingAmount: "500",
        },
      ],
      debts: [
        {
          row: 2,
          ref: "VICTOR",
          direction: "OWED_TO_YOU",
          counterparty: "Victor",
          principal: "200000",
          currency: "CLP",
          openedAt: DATE,
          totalInstallments: 4,
          frequency: "MONTHLY",
          frequencyInterval: 1,
        },
      ],
      debtPayments: [{ row: 2, debtRef: "VICTOR", paidAt: DATE, accountId: ACCOUNT }],
      plans: [
        {
          row: 2,
          ref: "NOTEBOOK",
          title: "Notebook",
          startDate: DATE,
          totalPrincipal: "623992",
          installmentCount: 6,
          currency: "CLP",
          frequency: "MONTHLY",
          frequencyInterval: 1,
        },
      ],
      planPayments: [{ row: 2, planRef: "NOTEBOOK", sequence: 1, paidAt: DATE }],
      recurring: [
        {
          row: 2,
          label: "Spotify",
          amount: "6990",
          currency: "CLP",
          frequency: "MONTHLY",
          interval: 1,
          anchorDate: DATE,
        },
      ],
      goals: [{ row: 2, ref: "VIAJE", title: "Viaje", targetAmount: "1000000", currency: "CLP" }],
      contributions: [
        { row: 2, goalRef: "VIAJE", contributedAt: DATE, amount: "50000", bankAccountId: ACCOUNT },
      ],
    });
    expect(parsed.success).toBe(true);
    // Sheets left out default to empty.
    const only = templateImportRequestSchema.parse({ movements: [movement] });
    expect(only.debts).toEqual([]);
    expect(only.balanceModes).toEqual([]);
  });

  it("refuses a request with no rows at all", () => {
    expect(templateImportRequestSchema.safeParse({}).success).toBe(false);
  });

  it(`refuses more than ${TEMPLATE_IMPORT_MAX_ROWS} rows across all sheets`, () => {
    const rows = Array.from({ length: TEMPLATE_IMPORT_MAX_ROWS + 1 }, (_, i) => ({
      ...movement,
      row: i + 2,
    }));
    expect(templateImportRequestSchema.safeParse({ movements: rows }).success).toBe(false);
    expect(
      templateImportRequestSchema.safeParse({ movements: rows.slice(0, TEMPLATE_IMPORT_MAX_ROWS) })
        .success,
    ).toBe(true);
  });

  it("requires row ids to be UUID v7 and amounts to be positive", () => {
    expect(
      templateImportRequestSchema.safeParse({ movements: [{ ...movement, bankAccountId: "x" }] })
        .success,
    ).toBe(false);
    expect(
      templateImportRequestSchema.safeParse({ movements: [{ ...movement, amount: "-5" }] }).success,
    ).toBe(false);
    expect(
      templateImportRequestSchema.safeParse({ movements: [{ ...movement, amount: "0" }] }).success,
    ).toBe(false);
  });

  it("points every row at an Excel row (the header is row 1)", () => {
    expect(
      templateImportRequestSchema.safeParse({ movements: [{ ...movement, row: 1 }] }).success,
    ).toBe(false);
  });

  it("carries one balance mode per account", () => {
    const parsed = templateImportRequestSchema.safeParse({
      movements: [movement],
      balanceModes: [{ accountId: ACCOUNT, mode: "ADD" }],
    });
    expect(parsed.success).toBe(true);
    expect(
      templateImportRequestSchema.safeParse({
        movements: [movement],
        balanceModes: [{ accountId: ACCOUNT, mode: "SOMETHING" }],
      }).success,
    ).toBe(false);
  });
});

describe("templatePlanPaymentSchema", () => {
  it("leaves account and amount optional — which one a plan needs is a server rule", () => {
    expect(
      templatePlanPaymentSchema.safeParse({ row: 2, planRef: "P", sequence: 1, paidAt: DATE })
        .success,
    ).toBe(true);
    expect(
      templatePlanPaymentSchema.safeParse({
        row: 2,
        planRef: "P",
        sequence: 0,
        paidAt: DATE,
      }).success,
    ).toBe(false);
  });
});
