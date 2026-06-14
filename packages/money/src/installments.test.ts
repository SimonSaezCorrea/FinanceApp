import { describe, expect, it } from "vitest";

import { equalPrincipalSchedule } from "./installments";
import { sumMoney } from "./index";

describe("equalPrincipalSchedule", () => {
  it("splits principal equally with no interest", () => {
    const rows = equalPrincipalSchedule({ totalPrincipal: "1200", installmentCount: 3 });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.principal)).toEqual(["400.0000", "400.0000", "400.0000"]);
    expect(rows.every((r) => r.interest === "0.0000")).toBe(true);
  });

  it("puts the rounding remainder on the last installment and totals exactly", () => {
    const rows = equalPrincipalSchedule({ totalPrincipal: "100", installmentCount: 3 });
    // 100/3 = 33.3333 x2, last absorbs the remainder
    expect(rows[0]!.principal).toBe("33.3333");
    expect(rows[2]!.principal).toBe("33.3334");
    expect(sumMoney(rows.map((r) => r.principal))).toBe("100.0000");
  });

  it("applies simple interest on the outstanding balance", () => {
    const rows = equalPrincipalSchedule({
      totalPrincipal: "1000",
      installmentCount: 2,
      aprPerPeriod: "0.01",
    });
    // period 1: interest on 1000 = 10; period 2: interest on 500 = 5
    expect(rows[0]!.interest).toBe("10.0000");
    expect(rows[1]!.interest).toBe("5.0000");
  });

  it("rejects invalid counts", () => {
    expect(() => equalPrincipalSchedule({ totalPrincipal: "100", installmentCount: 0 })).toThrow();
  });
});
