import { describe, expect, it } from "vitest";

import {
  compoundFutureValue,
  nominalAnnualToMonthlyRate,
  simpleFutureValue,
  simpleInterestAccrued,
} from "./interest";

describe("simpleFutureValue", () => {
  it("computes P * (1 + r*t)", () => {
    // 1000 * (1 + 0.05*2) = 1000 * 1.1 = 1100
    expect(simpleFutureValue({ principal: "1000", annualRate: "0.05", years: 2 })).toBe(
      "1100.0000",
    );
  });

  it("preserves precision where float would drift", () => {
    // 0.1 * (1 + 0.2*3) = 0.1 * 1.6 = 0.16 exactly.
    // In IEEE-754 float, 0.1 * 1.6 === 0.16000000000000003, which would
    // round/serialize incorrectly. Decimal keeps it exact.
    expect(simpleFutureValue({ principal: "0.1", annualRate: "0.2", years: 3 })).toBe("0.1600");
    expect(0.1 * (1 + 0.2 * 3)).not.toBe(0.16); // proves the float hazard
  });

  it("returns the principal unchanged at zero rate (edge case)", () => {
    expect(simpleFutureValue({ principal: "500", annualRate: 0, years: 5 })).toBe("500.0000");
  });
});

describe("simpleInterestAccrued", () => {
  it("returns FV - P = P*r*t", () => {
    // 1000 * 0.05 * 2 = 100
    expect(simpleInterestAccrued({ principal: "1000", annualRate: "0.05", years: 2 })).toBe(
      "100.0000",
    );
  });

  it("is zero when rate is zero (edge case)", () => {
    expect(simpleInterestAccrued({ principal: "500", annualRate: 0, years: 5 })).toBe("0.0000");
  });
});

describe("compoundFutureValue", () => {
  it("computes A = P * (1 + r/n)^(n*t)", () => {
    // 1000 * (1 + 0.10/2)^(2*1) = 1000 * 1.05^2 = 1000 * 1.1025 = 1102.5
    expect(
      compoundFutureValue({
        principal: "1000",
        annualRate: "0.10",
        compoundsPerYear: 2,
        years: 1,
      }),
    ).toBe("1102.5000");
  });

  it("returns the principal unchanged at zero years (edge case)", () => {
    // (anything)^0 = 1
    expect(
      compoundFutureValue({
        principal: "1000",
        annualRate: "0.10",
        compoundsPerYear: 12,
        years: 0,
      }),
    ).toBe("1000.0000");
  });

  it("rejects non-positive compoundsPerYear", () => {
    expect(() =>
      compoundFutureValue({
        principal: "1000",
        annualRate: "0.10",
        compoundsPerYear: 0,
        years: 1,
      }),
    ).toThrow();
  });
});

describe("nominalAnnualToMonthlyRate", () => {
  it("divides the annual rate by 12", () => {
    // 0.12 / 12 = 0.01
    expect(nominalAnnualToMonthlyRate("0.12")).toBe("0.0100");
  });

  it("is zero for a zero annual rate (edge case)", () => {
    expect(nominalAnnualToMonthlyRate(0)).toBe("0.0000");
  });
});
