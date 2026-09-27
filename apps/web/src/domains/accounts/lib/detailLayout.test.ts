import type { accounts } from "@finance/contracts";
import { describe, expect, it } from "vitest";

import { hasCardsAside } from "./detailLayout";

const account = (
  type: accounts.AccountType,
  pools: accounts.CreditPool[] = [],
): Pick<accounts.BankAccount, "type" | "creditPools"> => ({ type, creditPools: pools });

const pool = (currency: string): accounts.CreditPool => ({
  currency,
  limit: "1000",
  used: "0",
});

describe("hasCardsAside", () => {
  it("keeps the column for an account that carries cards", () => {
    expect(hasCardsAside(account("CHECKING"), true)).toBe(true);
  });

  it("drops it for cash: there are no cards, and the table should use that width", () => {
    expect(hasCardsAside(account("CASH"), false)).toBe(false);
    expect(hasCardsAside(account("INVESTMENT"), false)).toBe(false);
  });

  it("credit pools never claim it: each one is a Crédito KPI in the header", () => {
    expect(hasCardsAside(account("CREDIT_CARD", [pool("CLP"), pool("USD")]), false)).toBe(false);
    expect(hasCardsAside(account("SAVINGS", [pool("CLP")]), false)).toBe(false);
  });
});
