import { describe, expect, it } from "vitest";

import { SavingsEntry } from "../../../../src/domains/savings-entry/domain/savings-entry.aggregate";

function makeEntry(overrides: Partial<Parameters<typeof SavingsEntry.fromPersistence>[0]> = {}) {
  return SavingsEntry.fromPersistence({
    id: "e1",
    userId: "u1",
    savingsGoalId: "g1",
    amount: "200000",
    currency: "CLP",
    contributedAt: new Date("2026-03-01T00:00:00Z"),
    title: null,
    note: null,
    bankAccountId: "a1",
    transactionId: "t1",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  });
}

// The only operation that used to be impossible on this aggregate — a
// contribution recorded by mistake had no way back (spec 015, US3).
describe("SavingsEntry.applyUpdate", () => {
  it("patches only the provided fields", () => {
    const entry = makeEntry();
    entry.applyUpdate({ amount: "150000" });
    const contract = entry.toContract();
    expect(contract.amount).toBe("150000.0000");
    expect(contract.currency).toBe("CLP");
    expect(contract.savingsGoalId).toBe("g1");
  });

  it("moves the contribution to a different goal", () => {
    const entry = makeEntry({ savingsGoalId: "g1" });
    entry.applyUpdate({ savingsGoalId: "g2" });
    expect(entry.toContract().savingsGoalId).toBe("g2");
  });

  it("can detach a contribution from any goal", () => {
    const entry = makeEntry({ savingsGoalId: "g1" });
    entry.applyUpdate({ savingsGoalId: null });
    expect(entry.toContract().savingsGoalId).toBeNull();
  });

  it("updates the contribution date and note", () => {
    const entry = makeEntry();
    entry.applyUpdate({
      contributedAt: new Date("2026-04-15T00:00:00Z"),
      note: "corrected",
    });
    const contract = entry.toContract();
    expect(contract.contributedAt).toBe("2026-04-15T00:00:00.000Z");
    expect(contract.note).toBe("corrected");
  });

  it("leaves fields not present in the patch untouched", () => {
    const entry = makeEntry({ amount: "200000", note: "original" });
    entry.applyUpdate({ amount: "150000" });
    expect(entry.toContract().note).toBe("original");
  });

  it("changes the currency independently of the amount", () => {
    const entry = makeEntry({ currency: "CLP" });
    entry.applyUpdate({ currency: "USD" });
    expect(entry.toContract().currency).toBe("USD");
  });
});
