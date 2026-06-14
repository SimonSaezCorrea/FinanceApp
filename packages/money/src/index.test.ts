import { describe, expect, it } from "vitest";

import { addMoney, moneyToString, subtractMoney, sumMoney, toMoney } from "./index.js";

describe("money", () => {
  it("preserves precision that floats would lose", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float; must be exact here.
    expect(addMoney("0.1", "0.2")).toBe("0.3000");
  });

  it("serializes to fixed 4-decimal scale", () => {
    expect(moneyToString("1240.5")).toBe("1240.5000");
    expect(moneyToString(5)).toBe("5.0000");
  });

  it("sums a list exactly", () => {
    expect(sumMoney(["10.10", "20.20", "0.70"])).toBe("31.0000");
  });

  it("subtracts exactly", () => {
    expect(subtractMoney("100.00", "33.33")).toBe("66.6700");
  });

  it("uses banker's rounding (half-even)", () => {
    expect(moneyToString("1.00005", 4)).toBe("1.0000");
    expect(moneyToString("1.00015", 4)).toBe("1.0002");
  });

  it("rejects invalid input", () => {
    expect(() => toMoney("not-a-number")).toThrow();
  });
});
