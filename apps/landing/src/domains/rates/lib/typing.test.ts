import { describe, expect, it } from "vitest";

import { formatWhileTyping, groupDecimal } from "./typing";

/** `|` marks the caret in both the input and the expected result. */
function type(
  text: string,
  lang: "es" | "en",
  how: { typedPoint?: boolean; pasted?: boolean } = {},
) {
  const caret = text.indexOf("|");
  const r = formatWhileTyping(text.replace("|", ""), caret, lang, how);
  return `${r.value.slice(0, r.caret)}|${r.value.slice(r.caret)}`;
}

describe("formatWhileTyping (groups thousands as you type)", () => {
  it("groups in Spanish with dots and keeps the caret after the same digit", () => {
    expect(type("1500|", "es")).toBe("1.500|");
    expect(type("150000000|", "es")).toBe("150.000.000|");
    expect(type("1.5000|", "es")).toBe("15.000|");
    expect(type("12|3456", "es")).toBe("12|3.456");
  });

  it("groups in English with commas", () => {
    expect(type("1500000|", "en")).toBe("1,500,000|");
    expect(type("1500.5|", "en")).toBe("1,500.5|");
  });

  it("keeps every decimal typed, as many as typed", () => {
    expect(type("1500,2|", "es")).toBe("1.500,2|");
    expect(type("1500,|", "es")).toBe("1.500,|");
    expect(type("3,123456789012|", "es")).toBe("3,123456789012|");
    expect(type("1234,5678|", "en")).toBe("12,345,678|");
    expect(type("1234.5678|", "en")).toBe("1,234.5678|");
  });

  it("in Spanish, a dot typed as the decimal point becomes a comma", () => {
    expect(type("1500.|", "es", { typedPoint: true })).toBe("1.500,|");
  });

  it("in Spanish, a pasted lone dot that isn't a thousands group is the decimal point", () => {
    expect(type("1.5|", "es", { pasted: true })).toBe("1,5|");
    expect(type("1.500|", "es", { pasted: true })).toBe("1.500|");
  });

  it("a digit typed after the field's own grouping keeps growing the number (regression)", () => {
    expect(type("1.0000|", "es")).toBe("10.000|");
    expect(type("10.0000|", "es")).toBe("100.000|");
    expect(type("1.00|", "es")).toBe("100|");
  });

  it("drops leading zeros but keeps the zero before a decimal point", () => {
    expect(type("0005|", "es")).toBe("5|");
    expect(type(",5|", "es")).toBe("0,5|");
  });

  it("removes anything that isn't a digit or the decimal point", () => {
    expect(type("1a2b3|", "es")).toBe("123|");
    expect(type("|", "es")).toBe("|");
  });
});

describe("groupDecimal", () => {
  it("groups the integer part and keeps every decimal", () => {
    expect(groupDecimal("1234567.000025", "es")).toBe("1.234.567,000025");
    expect(groupDecimal("1234567", "en")).toBe("1,234,567");
    expect(groupDecimal("0.5", "es")).toBe("0,5");
  });
});
