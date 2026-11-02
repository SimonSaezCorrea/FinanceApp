import { describe, expect, it, vi } from "vitest";

import {
  creditPoolUsage,
  foreignCreditContext,
} from "../../../../../src/domains/transaction/application/credit-pool-usage";

function deps(carried: Record<string, string> = {}, line: unknown = null) {
  return {
    lines: { findForAccountCurrency: vi.fn(async () => line as never) },
    movements: {
      sumsForAccountCurrency: vi.fn(async () => ({ income: "60", expense: "100" })),
    },
    statements: { carriedOverOwed: vi.fn(async () => new Map(Object.entries(carried))) },
  };
}

const input = { userId: "u1", accountId: "acc_1", currency: "USD" };

describe("creditPoolUsage (spec 039)", () => {
  it("adds the opening debt, every charge still owed minus payments, and a carried shortfall", async () => {
    const d = deps({ "acc_1:USD": "40" });
    expect(await creditPoolUsage(d, "5", input)).toBe("85.0000");
    expect(d.movements.sumsForAccountCurrency).toHaveBeenCalledWith(
      "u1",
      "acc_1",
      "USD",
      undefined,
    );
  });

  it("leaves the movement being edited out of its own usage", async () => {
    const d = deps();
    await creditPoolUsage(d, "0", { ...input, excludeTxId: "tx_9" });
    expect(d.movements.sumsForAccountCurrency).toHaveBeenCalledWith("u1", "acc_1", "USD", "tx_9");
  });
});

describe("foreignCreditContext (spec 039)", () => {
  it("is null for a movement in the account's own currency, or on a non-credit account", async () => {
    const d = deps();
    expect(
      await foreignCreditContext(d, { type: "CREDIT_CARD", currency: "USD" }, input),
    ).toBeNull();
    expect(await foreignCreditContext(d, { type: "CHECKING", currency: "CLP" }, input)).toBeNull();
    expect(d.lines.findForAccountCurrency).not.toHaveBeenCalled();
  });

  it("says the account has no credit there", async () => {
    expect(
      await foreignCreditContext(deps(), { type: "CREDIT_CARD", currency: "CLP" }, input),
    ).toEqual({ pool: null });
  });

  it("gives the account's line with what is used of it", async () => {
    const d = deps({}, { id: "l1", currency: "USD", limitAmount: "3000", usedInitial: "0" });
    expect(await foreignCreditContext(d, { type: "CREDIT_CARD", currency: "CLP" }, input)).toEqual({
      pool: { limitAmount: "3000", used: "40.0000" },
    });
  });
});
