import { describe, expect, it } from "vitest";

import { formatRutInput } from "./formatRut";

describe("formatRutInput", () => {
  it("adds dots and a dash as digits accumulate", () => {
    expect(formatRutInput("1")).toBe("1");
    expect(formatRutInput("12")).toBe("1-2");
    expect(formatRutInput("123456785")).toBe("12.345.678-5");
  });

  it("uppercases a k check digit", () => {
    expect(formatRutInput("11111111k")).toBe("11.111.111-K");
  });

  it("is idempotent — formatting an already-formatted RUT changes nothing", () => {
    expect(formatRutInput("12.345.678-5")).toBe("12.345.678-5");
  });

  it("strips anything that isn't a digit or k", () => {
    expect(formatRutInput("12a345!678-5")).toBe("12.345.678-5");
  });

  it("caps at 9 raw characters (8-digit body + check digit)", () => {
    expect(formatRutInput("1234567890000")).toBe("12.345.678-9");
  });
});
