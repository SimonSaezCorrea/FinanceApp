import { describe, expect, it } from "vitest";

import { Investment } from "../../../../../src/domains/investment/domain/investment.aggregate";

function makeInvestment(overrides: Partial<Parameters<typeof Investment.fromPersistence>[0]> = {}) {
  return Investment.fromPersistence({
    id: "i1",
    userId: "u1",
    kind: "ETF",
    label: "Vanguard S&P 500",
    currency: "USD",
    symbol: "VOO",
    shares: "12.34567890",
    annualRate: null,
    principal: null,
    bankAccountId: null,
    openedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  });
}

describe("Investment.planCreation", () => {
  it("plans a brand-new ETF investment with nulled-out optional fields", () => {
    const planned = Investment.planCreation({
      kind: "ETF",
      label: "Vanguard S&P 500",
      currency: "USD",
      symbol: "VOO",
      shares: "12.34567890",
    });
    expect(planned.symbol).toBe("VOO");
    expect(planned.shares).toBe("12.34567890");
    expect(planned.annualRate).toBeNull();
    expect(planned.principal).toBeNull();
    expect(planned.bankAccountId).toBeNull();
    expect(planned.openedAt).toBeNull();
  });

  it("plans a remunerated account, passing annualRate/principal through unformatted", () => {
    const planned = Investment.planCreation({
      kind: "REMUNERATED_ACCOUNT",
      label: "High Yield Savings",
      currency: "USD",
      annualRate: "0.045",
      principal: "10000",
    });
    expect(planned.annualRate).toBe("0.045");
    expect(planned.principal).toBe("10000");
    expect(planned.symbol).toBeNull();
    expect(planned.shares).toBeNull();
  });
});

describe("Investment.toContract", () => {
  it("maps money fields as raw strings (no scale forcing) and dates as ISO", () => {
    const investment = makeInvestment();
    expect(investment.toContract()).toEqual({
      id: "i1",
      kind: "ETF",
      label: "Vanguard S&P 500",
      currency: "USD",
      symbol: "VOO",
      shares: "12.34567890",
      annualRate: null,
      principal: null,
      bankAccountId: null,
      openedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("maps a null openedAt as null (not every investment has one)", () => {
    const investment = makeInvestment({ openedAt: null });
    expect(investment.toContract().openedAt).toBeNull();
  });
});

describe("Investment.applyUpdate", () => {
  it("patches only the provided scalar fields", () => {
    const investment = makeInvestment();
    investment.applyUpdate({ label: "New label", symbol: "SPY" });
    expect(investment.toContract().label).toBe("New label");
    expect(investment.toContract().symbol).toBe("SPY");
    expect(investment.toContract().shares).toBe("12.34567890");
  });

  it("passes annualRate through unformatted on update for a REMUNERATED_ACCOUNT", () => {
    const investment = makeInvestment({
      kind: "REMUNERATED_ACCOUNT",
      symbol: null,
      shares: null,
      annualRate: "0.040000",
      principal: "5000.0000",
    });
    investment.applyUpdate({ annualRate: "0.045000" });
    expect(investment.toContract().annualRate).toBe("0.045000");
  });
});
