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

  it("rounds to whole pesos for CLP, the last instalment absorbing the rest", () => {
    const rows = equalPrincipalSchedule({
      totalPrincipal: "64990",
      installmentCount: 3,
      currency: "CLP",
    });
    expect(rows.map((r) => r.payment)).toEqual(["21663.0000", "21663.0000", "21664.0000"]);
    expect(sumMoney(rows.map((r) => r.payment))).toBe("64990.0000");
  });

  it("rounds to cents for USD and to 4 decimals for the UF", () => {
    const usd = equalPrincipalSchedule({
      totalPrincipal: "100",
      installmentCount: 3,
      currency: "USD",
    });
    expect(usd.map((r) => r.payment)).toEqual(["33.3300", "33.3300", "33.3400"]);
    const uf = equalPrincipalSchedule({
      totalPrincipal: "1",
      installmentCount: 3,
      currency: "CLF",
    });
    expect(uf.map((r) => r.payment)).toEqual(["0.3333", "0.3333", "0.3334"]);
  });

  it("rounds interest to the currency too", () => {
    const rows = equalPrincipalSchedule({
      totalPrincipal: "100001",
      installmentCount: 2,
      aprPerPeriod: "0.015",
      currency: "CLP",
    });
    // interest on 100001 = 1500.015 → 1500; on 50001 = 750.015 → 750
    expect(rows.map((r) => r.interest)).toEqual(["1500.0000", "750.0000"]);
    expect(rows.map((r) => r.payment)).toEqual(["51500.0000", "50751.0000"]);
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
