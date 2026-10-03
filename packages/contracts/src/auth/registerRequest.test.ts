import { describe, expect, it } from "vitest";

import { calculateAgeFromBirthDate, registerRequestSchema } from "./index";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ana Titular",
    email: "a@b.com",
    password: "password123",
    identifierValue: "12.345.678-5",
    birthDate: "1990-01-01",
    sensitiveDataConsent: true,
    ...overrides,
  };
}

describe("calculateAgeFromBirthDate", () => {
  it("computes full years elapsed", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(calculateAgeFromBirthDate(new Date("2000-06-14"), now)).toBe(26);
  });

  it("has not had this year's birthday yet", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(calculateAgeFromBirthDate(new Date("2000-06-16"), now)).toBe(25);
  });
});

describe("registerRequestSchema — minor guardian authorization", () => {
  it("accepts an adult with no guardianAuthorization", () => {
    const result = registerRequestSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("rejects a minor with no guardianAuthorization", () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const result = registerRequestSchema.safeParse(
      baseInput({ birthDate: tenYearsAgo.toISOString() }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a minor with a complete guardianAuthorization", () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const result = registerRequestSchema.safeParse(
      baseInput({
        birthDate: tenYearsAgo.toISOString(),
        guardianAuthorization: {
          name: "Ana Madre",
          identifierValue: "11.111.111-1",
          relationship: "MOTHER",
          accepted: true,
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a guardianAuthorization whose accepted flag is not true", () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const result = registerRequestSchema.safeParse(
      baseInput({
        birthDate: tenYearsAgo.toISOString(),
        guardianAuthorization: {
          name: "Ana Madre",
          identifierValue: "11.111.111-1",
          relationship: "MOTHER",
          accepted: false,
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unchecked sensitiveDataConsent", () => {
    const result = registerRequestSchema.safeParse(baseInput({ sensitiveDataConsent: false }));
    expect(result.success).toBe(false);
  });

  it("rejects a missing name (now mandatory for the titular too)", () => {
    const result = registerRequestSchema.safeParse(baseInput({ name: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects the titular's own RUT when its check digit is invalid", () => {
    const result = registerRequestSchema.safeParse(baseInput({ identifierValue: "12.345.678-9" }));
    expect(result.success).toBe(false);
  });
});
