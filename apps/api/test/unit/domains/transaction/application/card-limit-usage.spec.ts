import { describe, expect, it, vi } from "vitest";

import { cardLimitUsage } from "../../../../../src/domains/transaction/application/card-limit-usage";

function deps(carried: Record<string, string> = {}) {
  return {
    movements: { sumsForCard: vi.fn(async () => ({ income: "60", expense: "100" })) },
    statements: { carriedOverOwed: vi.fn(async () => new Map(Object.entries(carried))) },
  };
}

const base = {
  userId: "u1",
  accountId: "acc_1",
  accountCurrency: "CLP",
  card: { id: "card_1", isPrimary: true },
  currency: "USD",
};

describe("cardLimitUsage", () => {
  it("counts only what is still owed (openOnly) and adds a foreign shortfall carried over", async () => {
    const d = deps({ "acc_1:USD": "40" });
    const usage = await cardLimitUsage(d, base);
    expect(d.movements.sumsForCard).toHaveBeenCalledWith("u1", "card_1", "USD", undefined, true);
    expect(usage).toEqual({ income: "60", expense: "140.0000" });
  });

  it("never adds the carry-over in the account's own currency (it is in creditUsed already)", async () => {
    const d = deps({ "acc_1:CLP": "40" });
    expect(await cardLimitUsage(d, { ...base, currency: "CLP" })).toEqual({
      income: "60",
      expense: "100",
    });
    expect(d.statements.carriedOverOwed).not.toHaveBeenCalled();
  });

  it("an additional card never carries the period's shortfall (settlements land on the primary)", async () => {
    const d = deps({ "acc_1:USD": "40" });
    const usage = await cardLimitUsage(d, { ...base, card: { id: "card_2", isPrimary: false } });
    expect(usage.expense).toBe("100");
  });

  it("passes the movement being edited through, so it doesn't count against itself", async () => {
    const d = deps();
    await cardLimitUsage(d, { ...base, excludeTxId: "tx_9" });
    expect(d.movements.sumsForCard).toHaveBeenCalledWith("u1", "card_1", "USD", "tx_9", true);
  });
});
