import { describe, expect, it } from "vitest";

import { foreignLimitWithCarry } from "../../../../../../src/domains/bank-account/application/queries/account-dto.mapper";

const limit = { id: "l1", currency: "USD", limitAmount: "1000.0000", used: "0.0000" };

describe("foreignLimitWithCarry", () => {
  it("adds what a short USD payment carried into the next period back onto the limit's usage", () => {
    const carried = new Map([["acc_1:USD", "40.0000"]]);
    expect(foreignLimitWithCarry(limit, "acc_1", "CLP", carried).used).toBe("40.0000");
  });

  it("leaves the account's own currency alone (its carry-over is in creditUsed)", () => {
    const clp = { ...limit, currency: "CLP" };
    const carried = new Map([["acc_1:CLP", "40.0000"]]);
    expect(foreignLimitWithCarry(clp, "acc_1", "CLP", carried)).toBe(clp);
  });

  it("is a no-op with nothing carried", () => {
    expect(foreignLimitWithCarry(limit, "acc_1", "CLP", new Map())).toBe(limit);
  });
});
