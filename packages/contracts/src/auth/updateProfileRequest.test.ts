import { describe, expect, it } from "vitest";

import { updateProfileRequestSchema } from "./index";

describe("updateProfileRequestSchema", () => {
  it("rejects an invalid RUT check digit", () => {
    const result = updateProfileRequestSchema.safeParse({
      identifierType: "RUT",
      identifierValue: "12.345.678-9",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid RUT", () => {
    const result = updateProfileRequestSchema.safeParse({
      identifierType: "RUT",
      identifierValue: "12.345.678-5",
    });
    expect(result.success).toBe(true);
  });

  it("does not validate check digits for non-RUT identifier types", () => {
    const result = updateProfileRequestSchema.safeParse({
      identifierType: "DNI",
      identifierValue: "any-format-goes",
    });
    expect(result.success).toBe(true);
  });

  it("allows omitting the identifier entirely", () => {
    const result = updateProfileRequestSchema.safeParse({ name: "Ana" });
    expect(result.success).toBe(true);
  });
});
