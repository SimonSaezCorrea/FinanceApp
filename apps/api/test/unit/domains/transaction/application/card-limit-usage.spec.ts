import { describe, expect, it, vi } from "vitest";

import { cardLimitUsage } from "../../../../../src/domains/transaction/application/card-limit-usage";

function deps() {
  return { movements: { sumsForCard: vi.fn(async () => ({ income: "60", expense: "100" })) } };
}

const base = {
  userId: "u1",
  accountId: "acc_1",
  accountCurrency: "CLP",
  card: { id: "card_2", isPrimary: false },
  currency: "USD",
};

describe("cardLimitUsage", () => {
  it("counts only what the card still owes (openOnly), never a period's carried shortfall", async () => {
    const d = deps();
    const usage = await cardLimitUsage(d, base);
    expect(d.movements.sumsForCard).toHaveBeenCalledWith("u1", "card_2", "USD", undefined, true);
    // Spec 039: a shortfall carried into the next period is the ACCOUNT's debt (its credit
    // line), never a sub-limit's.
    expect(usage).toEqual({ income: "60", expense: "100" });
  });

  it("passes the movement being edited through, so it doesn't count against itself", async () => {
    const d = deps();
    await cardLimitUsage(d, { ...base, excludeTxId: "tx_9" });
    expect(d.movements.sumsForCard).toHaveBeenCalledWith("u1", "card_2", "USD", "tx_9", true);
  });
});
