import { describe, expect, it } from "vitest";

import { EXTRA_CURRENCIES_MAX, updatePreferencesRequestSchema } from "./index";

describe("updatePreferencesRequestSchema.extraCurrencies (security run-3)", () => {
  it("upper-cases and keeps each code once", () => {
    const parsed = updatePreferencesRequestSchema.parse({ extraCurrencies: ["usd", "USD", "CLF"] });
    expect(parsed.extraCurrencies).toEqual(["USD", "CLF"]);
  });

  it("refuses more than EXTRA_CURRENCIES_MAX entries", () => {
    const codes = Array.from({ length: EXTRA_CURRENCIES_MAX + 1 }, () => "USD");
    expect(updatePreferencesRequestSchema.safeParse({ extraCurrencies: codes }).success).toBe(
      false,
    );
  });

  it("refuses something that isn't three letters", () => {
    expect(updatePreferencesRequestSchema.safeParse({ extraCurrencies: ["U$D"] }).success).toBe(
      false,
    );
  });
});
