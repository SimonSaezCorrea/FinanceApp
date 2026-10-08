import { describe, expect, it } from "vitest";

import {
  canTransferStatement,
  creditStatementStatus,
  generateStatementSchema,
  isSettled,
  suggestedPeriodStart,
  payCreditStatementSchema,
  prepayCreditStatementSchema,
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

describe("generateStatementSchema", () => {
  const ok = {
    periodStart: "2026-08-21T04:00:00.000Z",
    closedAt: "2026-09-21T02:59:59.999Z",
    dueDate: "2026-10-06T02:59:59.999Z",
  };
  it("accepts start < close <= due", () => {
    expect(generateStatementSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects a close before the start and a due date before the close", () => {
    expect(generateStatementSchema.safeParse({ ...ok, closedAt: ok.periodStart }).success).toBe(
      false,
    );
    expect(generateStatementSchema.safeParse({ ...ok, dueDate: ok.periodStart }).success).toBe(
      false,
    );
  });
});

describe("suggestedPeriodStart", () => {
  it("is the local day after the latest close, whatever the currency", () => {
    const close = new Date(2026, 7, 20, 23, 59, 59, 999);
    const older = new Date(2026, 6, 20, 23, 59, 59, 999);
    expect(
      suggestedPeriodStart([
        { closedAt: older.toISOString() },
        { closedAt: close.toISOString() },
        { closedAt: null },
      ]),
    ).toBe("2026-08-21");
  });
  it("is null when the account was never billed", () => {
    expect(suggestedPeriodStart([{ closedAt: null }])).toBeNull();
  });
});

describe("prepayCreditStatementSchema (spec 030)", () => {
  const body = { fromAccountId: "0199e7c5-0000-7000-8000-000000000001", amount: "20.00" };

  it("still requires an amount", () => {
    expect(prepayCreditStatementSchema.safeParse({ fromAccountId: body.fromAccountId }).success).toBe(
      false,
    );
  });

  it("accepts the amount debited from the source account, in ITS currency", () => {
    const parsed = prepayCreditStatementSchema.parse({ ...body, chargedAmount: "19600" });
    expect(parsed.chargedAmount).toBe("19600");
  });

  it("keeps working without it (a prepago in the account's own currency)", () => {
    expect(prepayCreditStatementSchema.safeParse(body).success).toBe(true);
  });

  it("rejects a non-decimal chargedAmount", () => {
    expect(prepayCreditStatementSchema.safeParse({ ...body, chargedAmount: "abc" }).success).toBe(false);
  });
});
