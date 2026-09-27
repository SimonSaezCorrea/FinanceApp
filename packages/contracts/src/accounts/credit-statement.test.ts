import { describe, expect, it } from "vitest";

import {
  canTransferStatement,
  creditStatementStatus,
  isSettled,
  payCreditStatementSchema,
  transferCreditStatementSchema,
  updateStatementPaymentSchema,
} from "./index";

const base = {
  currency: "USD",
  closedAt: "2026-08-20T00:00:00.000Z",
  paidAt: null as string | null,
  transferredAt: null as string | null,
  remainingAmount: "70.72",
  dueDate: "2026-09-03T00:00:00.000Z" as string | null,
};
const after = new Date("2026-09-10T12:00:00.000Z");
const before = new Date("2026-09-01T12:00:00.000Z");

describe("credit statement status", () => {
  it("includes TRANSFERRED", () => {
    expect(creditStatementStatus.options).toContain("TRANSFERRED");
  });

  it("isSettled: paid or transferred", () => {
    expect(isSettled({ paidAt: null, transferredAt: null })).toBe(false);
    expect(isSettled({ paidAt: "2026-09-01T00:00:00.000Z", transferredAt: null })).toBe(true);
    expect(isSettled({ paidAt: null, transferredAt: "2026-09-10T00:00:00.000Z" })).toBe(true);
  });
});

describe("canTransferStatement", () => {
  it("a closed, overdue, unsettled statement in another currency with a balance can be transferred", () => {
    expect(canTransferStatement(base, "CLP", after)).toBe(true);
  });

  it("not before its due date", () => {
    expect(canTransferStatement(base, "CLP", before)).toBe(false);
  });

  it("without a due date, as soon as it is closed", () => {
    expect(canTransferStatement({ ...base, dueDate: null }, "CLP", before)).toBe(true);
  });

  it("never in the account's own currency", () => {
    expect(canTransferStatement({ ...base, currency: "CLP" }, "CLP", after)).toBe(false);
  });

  it("never while open, once settled, or with nothing owed", () => {
    expect(canTransferStatement({ ...base, closedAt: null }, "CLP", after)).toBe(false);
    expect(
      canTransferStatement({ ...base, paidAt: "2026-09-02T00:00:00.000Z" }, "CLP", after),
    ).toBe(false);
    expect(
      canTransferStatement({ ...base, transferredAt: "2026-09-04T00:00:00.000Z" }, "CLP", after),
    ).toBe(false);
    expect(canTransferStatement({ ...base, remainingAmount: "0" }, "CLP", after)).toBe(false);
  });
});

describe("statement write schemas", () => {
  const fromAccountId = "01890a5d-ac96-774b-bcce-b302099a8001";

  it("pay accepts a chargedAmount for a statement in another currency", () => {
    expect(
      payCreditStatementSchema.parse({ fromAccountId, amount: "30", chargedAmount: "28500" })
        .chargedAmount,
    ).toBe("28500");
  });

  it("transfer requires an amount", () => {
    expect(transferCreditStatementSchema.safeParse({}).success).toBe(false);
    expect(transferCreditStatementSchema.parse({ amount: "66052" }).amount).toBe("66052");
  });

  it("correcting a payment accepts a chargedAmount", () => {
    expect(
      updateStatementPaymentSchema.parse({ amount: "30", chargedAmount: "28000" }).chargedAmount,
    ).toBe("28000");
  });
});
