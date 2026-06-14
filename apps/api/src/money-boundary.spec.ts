import { describe, expect, it } from "vitest";

import { accounts, transactions } from "@finance/contracts";
import { moneyToString } from "@finance/money";

// Money MUST cross the API boundary as decimal strings, never JS numbers
// (Constitution Principle I / FR-007a / SC-010). These contracts are the single
// source of truth shared by both apps (SC-005).
describe("money boundary", () => {
  it("accepts money as a decimal string", () => {
    const parsed = accounts.createBankAccountSchema.parse({
      name: "Checking",
      currency: "USD",
      currentBalance: "1240.5000",
    });
    expect(parsed.currentBalance).toBe("1240.5000");
  });

  it("rejects money provided as a JS number", () => {
    expect(() =>
      accounts.createBankAccountSchema.parse({
        name: "Checking",
        currency: "USD",
        currentBalance: 1240.5 as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects a transaction amount provided as a number", () => {
    expect(() =>
      transactions.createTransactionSchema.parse({
        type: "EXPENSE",
        amount: 33.3 as unknown as string,
        currency: "USD",
        occurredAt: "2026-03-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("money helper and contract agree on fixed-scale strings", () => {
    expect(moneyToString("1240.5")).toBe("1240.5000");
  });
});
