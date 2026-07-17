import { describe, expect, it } from "vitest";

import { isValidRut } from "./rut";

describe("isValidRut", () => {
  it("accepts a valid RUT with dots and dash", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
  });

  it("accepts the same RUT without formatting", () => {
    expect(isValidRut("123456785")).toBe(true);
  });

  it("accepts a RUT whose check digit is K", () => {
    expect(isValidRut("7.593.582-K")).toBe(true);
  });

  it("rejects an incorrect check digit", () => {
    expect(isValidRut("12.345.678-9")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidRut("not-a-rut")).toBe(false);
    expect(isValidRut("")).toBe(false);
  });
});
