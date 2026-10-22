import { describe, expect, it } from "vitest";

import { equalPrincipalSchedule } from "./installments";
import {
  caePercent,
  fixedPaymentSchedule,
  type SimulationInput,
  simulateInstallments,
  stampTaxRate,
  validateSimulationInput,
} from "./installmentSimulation";

// Expected figures come from an independent reference (Python `decimal`, ROUND_HALF_EVEN),
// computed by hand for spec 034's quickstart cases — not from this module.

const base: SimulationInput = {
  price: "300000",
  currency: "CLP",
  installments: 6,
  monthlyRatePercent: "2",
  system: "FIXED",
  stampTaxPercent: "",
  fee: "",
};

const sum = (values: string[]) => values.reduce((acc, v) => acc + Number(v), 0);

describe("fixedPaymentSchedule (cuota fija, US1)", () => {
  it("quickstart 1: CLP 300.000 in 6 at 2% → 53.558 ×5, the last absorbs", () => {
    const rows = fixedPaymentSchedule({
      totalPrincipal: "300000",
      installmentCount: 6,
      ratePerPeriod: "0.02",
      currency: "CLP",
    });
    expect(rows.map((r) => Number(r.payment))).toEqual([53558, 53558, 53558, 53558, 53558, 53557]);
    expect(sum(rows.map((r) => r.principal))).toBe(300000);
    expect(sum(rows.map((r) => r.interest))).toBe(21347);
    for (const r of rows) {
      expect(Number(r.payment)).toBe(Number(r.principal) + Number(r.interest));
    }
  });

  it("without interest splits like the app: 64.990 in 3 → 21.663 + 21.663 + 21.664", () => {
    const rows = fixedPaymentSchedule({
      totalPrincipal: "64990",
      installmentCount: 3,
      ratePerPeriod: "0",
      currency: "CLP",
    });
    expect(rows.map((r) => Number(r.payment))).toEqual([21663, 21663, 21664]);
  });

  it("one instalment pays the principal plus one month of interest", () => {
    const rows = fixedPaymentSchedule({
      totalPrincipal: "300000",
      installmentCount: 1,
      ratePerPeriod: "0.02",
      currency: "CLP",
    });
    expect(rows.map((r) => Number(r.payment))).toEqual([306000]);
  });

  it("rounds UF to 4 decimals and USD to 2", () => {
    const uf = fixedPaymentSchedule({
      totalPrincipal: "100",
      installmentCount: 24,
      ratePerPeriod: "0.005",
      currency: "CLF",
    });
    expect(Number(uf[0]!.payment)).toBe(4.4321);
    expect(Number(uf[23]!.payment)).toBe(4.4311);
    expect(sum(uf.map((r) => r.principal))).toBeCloseTo(100, 8);

    const usd = fixedPaymentSchedule({
      totalPrincipal: "1200",
      installmentCount: 12,
      ratePerPeriod: "0.015",
      currency: "USD",
    });
    expect(Number(usd[0]!.payment)).toBe(110.02);
    expect(Number(usd[11]!.payment)).toBe(109.98);
  });
});

describe("validateSimulationInput (US1, US4)", () => {
  it("accepts the default example", () => {
    expect(validateSimulationInput(base)).toEqual([]);
  });

  it.each([
    [{ price: "" }, "price", "required"],
    [{ price: "abc" }, "price", "invalid"],
    [{ price: "0" }, "price", "tooLow"],
    [{ price: "1000000000001" }, "price", "tooHigh"],
    [{ price: "100.5" }, "price", "tooManyDecimals"],
    [{ installments: null }, "installments", "required"],
    [{ installments: 0 }, "installments", "tooLow"],
    [{ installments: 61 }, "installments", "tooHigh"],
    [{ installments: 2.5 }, "installments", "invalid"],
    [{ monthlyRatePercent: "" }, "monthlyRatePercent", "required"],
    [{ monthlyRatePercent: "-1" }, "monthlyRatePercent", "tooLow"],
    [{ monthlyRatePercent: "12" }, "monthlyRatePercent", "tooHigh"],
    [{ monthlyRatePercent: "1.23456" }, "monthlyRatePercent", "tooManyDecimals"],
    [{ stampTaxPercent: "6" }, "stampTaxPercent", "tooHigh"],
    [{ fee: "-1" }, "fee", "tooLow"],
    [{ cashPrice: "0" }, "cashPrice", "tooLow"],
    [{ cashPrice: "300001" }, "cashPrice", "aboveCashLimit"],
  ] as const)("%o → %s %s", (patch, field, code) => {
    expect(validateSimulationInput({ ...base, ...patch })).toContainEqual({ field, code });
  });

  it("accepts the currency's own decimals (USD 2, UF 4)", () => {
    expect(validateSimulationInput({ ...base, currency: "USD", price: "1200.50" })).toEqual([]);
    expect(validateSimulationInput({ ...base, currency: "CLF", price: "100.1234" })).toEqual([]);
  });
});

describe("simulateInstallments, cuota fija without costs (US1)", () => {
  it("returns the summary of quickstart 1", () => {
    const r = simulateInstallments(base);
    expect(r.firstPayment).toBe("53558");
    expect(r.regularPayment).toBe("53558");
    expect(r.lastPayment).toBe("53557");
    expect(r.totalPaid).toBe("321347");
    expect(r.totalInterest).toBe("21347");
    expect(r.financed).toBe("300000");
    expect(r.costs).toBe("0");
  });

  it("throws on an input with issues", () => {
    expect(() => simulateInstallments({ ...base, price: "" })).toThrow();
  });
});

describe("stamp tax, fee and CAE (US2)", () => {
  it("stampTaxRate: 0,066% per month, capped at 0,8%", () => {
    expect(stampTaxRate(1)).toBe("0.066");
    expect(stampTaxRate(6)).toBe("0.396");
    expect(stampTaxRate(12)).toBe("0.792");
    expect(stampTaxRate(13)).toBe("0.8");
    expect(stampTaxRate(60)).toBe("0.8");
  });

  it("caePercent is the monthly rate × 12 (DS 43)", () => {
    expect(caePercent("300000", ["306000"])).toBe("24.00");
    expect(caePercent("64990", ["21663", "21663", "21664"])).toBe("0.00");
  });

  it("an omitted tax uses the legal rate; costs are financed (quickstart 2)", () => {
    const r = simulateInstallments({ ...base, stampTaxPercent: undefined });
    expect(r.stampTax).toBe("1188");
    expect(r.financed).toBe("301188");
    expect(r.firstPayment).toBe("53770");
    expect(r.totalPaid).toBe("322619");
    expect(r.caePercent).toBe("25.41");
    expect(sum(r.schedule.map((row) => row.costs))).toBe(1188);
  });

  it("CAE of quickstart 1 is 24,00% and rises with a fee", () => {
    expect(simulateInstallments(base).caePercent).toBe("24.00");
    const withFee = simulateInstallments({ ...base, fee: "5000" });
    expect(withFee.fee).toBe("5000");
    expect(withFee.costs).toBe("5000");
    expect(Number(withFee.caePercent)).toBeGreaterThan(24);
  });

  it("an empty tax field means no tax", () => {
    expect(simulateInstallments({ ...base, stampTaxPercent: "" }).stampTax).toBe("0");
  });

  it("UF and USD reference CAEs", () => {
    expect(
      simulateInstallments({
        ...base,
        currency: "CLF",
        price: "100",
        installments: 24,
        monthlyRatePercent: "0.5",
      }).caePercent,
    ).toBe("6.00");
    expect(
      simulateInstallments({
        ...base,
        currency: "USD",
        price: "1200",
        installments: 12,
        monthlyRatePercent: "1.5",
      }).caePercent,
    ).toBe("18.00");
  });

  it("costs far above the price still compute a (huge) CAE", () => {
    const r = simulateInstallments({ ...base, price: "1000", installments: 1, fee: "100000" });
    expect(Number(r.caePercent)).toBeGreaterThan(10000);
  });
});

describe("systems and the monthly table (US3)", () => {
  it("CONSTANT is exactly the app's equalPrincipalSchedule", () => {
    const r = simulateInstallments({ ...base, system: "CONSTANT" });
    const app = equalPrincipalSchedule({
      totalPrincipal: "300000",
      installmentCount: 6,
      aprPerPeriod: "0.02",
      currency: "CLP",
    });
    expect(r.schedule.map((row) => Number(row.payment))).toEqual(
      app.map((row) => Number(row.payment)),
    );
    expect(r.firstPayment).toBe("56000");
    expect(r.lastPayment).toBe("51000");
    expect(r.totalPaid).toBe("321000");
    expect(r.otherSystemTotal).toBe("321347");
    expect(r.systemDifference).toBe("-347");
  });

  it("FIXED reports the difference against CONSTANT", () => {
    const r = simulateInstallments(base);
    expect(r.otherSystemTotal).toBe("321000");
    expect(r.systemDifference).toBe("347");
  });

  it.each(["FIXED", "CONSTANT"] as const)("%s: the table sums exactly to the totals", (system) => {
    const r = simulateInstallments({ ...base, system, stampTaxPercent: undefined, fee: "999" });
    expect(sum(r.schedule.map((row) => row.principal))).toBe(Number(r.financed));
    expect(sum(r.schedule.map((row) => row.payment))).toBe(Number(r.totalPaid));
    expect(sum(r.schedule.map((row) => row.interest))).toBe(Number(r.totalInterest));
    expect(sum(r.schedule.map((row) => row.costs))).toBe(Number(r.costs));
    expect(r.schedule.at(-1)!.balance).toBe("0");
    expect(r.schedule[0]!.balance).toBe(
      String(Number(r.financed) - Number(r.schedule[0]!.principal)),
    );
  });
});

describe("cash vs instalments (US4)", () => {
  it("SAME when there is no interest and no cost", () => {
    const r = simulateInstallments({
      ...base,
      price: "64990",
      installments: 3,
      monthlyRatePercent: "0",
    });
    expect(r.cashComparison).toEqual({
      cashPrice: "64990",
      extra: "0",
      extraPercent: "0.00",
      kind: "SAME",
    });
    expect(r.caePercent).toBe("0.00");
  });

  it("COSTS_ONLY when it is 0% but the tax applies", () => {
    const r = simulateInstallments({
      ...base,
      price: "64990",
      installments: 3,
      monthlyRatePercent: "0",
      stampTaxPercent: undefined,
    });
    expect(r.stampTax).toBe("129");
    expect(r.cashComparison.kind).toBe("COSTS_ONLY");
    expect(r.cashComparison.extra).toBe("129");
  });

  it("MORE with interest, against a lower cash price when given", () => {
    const r = simulateInstallments({ ...base, cashPrice: "280000" });
    expect(r.cashComparison).toEqual({
      cashPrice: "280000",
      extra: "41347",
      extraPercent: "14.77",
      kind: "MORE",
    });
  });
});

describe("performance (SC-004 headroom)", () => {
  it("60 instalments in both systems with costs in under 20 ms", () => {
    simulateInstallments(base); // warm-up: the first call pays for module/JIT setup
    const start = performance.now();
    simulateInstallments({
      ...base,
      installments: 60,
      monthlyRatePercent: "10",
      stampTaxPercent: undefined,
      fee: "1000",
    });
    simulateInstallments({
      ...base,
      installments: 60,
      monthlyRatePercent: "10",
      system: "CONSTANT",
      fee: "1000",
    });
    expect(performance.now() - start).toBeLessThan(20);
  });
});
