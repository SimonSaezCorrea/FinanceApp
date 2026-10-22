import { describe, expect, it } from "vitest";

import { formatAmount, formatPercent, issueMessage, parseField, toInputText } from "./format";

describe("formatAmount", () => {
  it("writes each currency with its sign and decimals, per language", () => {
    expect(formatAmount("53558", "CLP", "es")).toBe("$53.558");
    expect(formatAmount("53558", "CLP", "en")).toBe("$53,558");
    expect(formatAmount("1200", "USD", "es")).toBe("US$1.200,00");
    expect(formatAmount("1200.5", "USD", "en")).toBe("US$1,200.50");
    expect(formatAmount("100", "CLF", "es")).toBe("UF 100,0000");
    expect(formatAmount("4.4321", "CLF", "en")).toBe("UF 4.4321");
  });

  it("keeps large CLP amounts exact", () => {
    expect(formatAmount("999999999999", "CLP", "es")).toBe("$999.999.999.999");
  });

  it("writes a negative amount with its sign", () => {
    expect(formatAmount("-347", "CLP", "es")).toBe("-$347");
  });
});

describe("formatPercent", () => {
  it("uses the language's decimal mark and spacing", () => {
    expect(formatPercent("24.00", "es")).toBe("24,00 %");
    expect(formatPercent("24.00", "en")).toBe("24.00%");
    expect(formatPercent("0.396", "es", 3)).toBe("0,396 %");
  });
});

describe("parseField", () => {
  it("reads Spanish numbers: dots group, comma is the decimal mark", () => {
    expect(parseField("300.000", "es")).toBe("300000");
    expect(parseField("$ 300.000", "es")).toBe("300000");
    expect(parseField("1,89", "es")).toBe("1.89");
    expect(parseField("1.5", "es")).toBe("1.5");
  });

  it("reads English numbers: commas group, dot is the decimal mark", () => {
    expect(parseField("300,000", "en")).toBe("300000");
    expect(parseField("1.89", "en")).toBe("1.89");
    expect(parseField("US$1,200.50", "en")).toBe("1200.50");
  });

  it("keeps zero (an interest-free rate) and empty as empty", () => {
    expect(parseField("0", "es")).toBe("0");
    expect(parseField("  ", "es")).toBe("");
  });

  it("passes unreadable text through so validation flags it", () => {
    expect(parseField("abc", "es")).toBe("abc");
  });
});

describe("toInputText", () => {
  it("writes a plain decimal the way the field shows it", () => {
    expect(toInputText("300000", "es")).toBe("300.000");
    expect(toInputText("0.396", "es")).toBe("0,396");
    expect(toInputText("1200.5", "en")).toBe("1,200.5");
  });
});

describe("issueMessage", () => {
  it.each([
    [{ field: "price", code: "required" }, "landing.simulator.errors.required", {}],
    [{ field: "price", code: "tooLow" }, "landing.simulator.errors.positive", {}],
    [{ field: "monthlyRatePercent", code: "tooLow" }, "landing.simulator.errors.notNegative", {}],
    [{ field: "installments", code: "invalid" }, "landing.simulator.errors.integer", {}],
    [
      { field: "installments", code: "tooHigh" },
      "landing.simulator.errors.maxInstallments",
      { max: 60 },
    ],
    [
      { field: "monthlyRatePercent", code: "tooHigh" },
      "landing.simulator.errors.maxRate",
      { max: "10" },
    ],
    [{ field: "price", code: "tooManyDecimals" }, "landing.simulator.errors.noDecimals", {}],
    [{ field: "cashPrice", code: "aboveCashLimit" }, "landing.simulator.errors.aboveCash", {}],
  ] as const)("%o → %s", (issue, key, params) => {
    expect(issueMessage(issue, "CLP")).toEqual({ key, params });
  });

  it("names the decimals a non-peso currency takes", () => {
    expect(issueMessage({ field: "price", code: "tooManyDecimals" }, "USD")).toEqual({
      key: "landing.simulator.errors.decimals",
      params: { count: 2 },
    });
  });
});
