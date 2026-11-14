import { describe, expect, it } from "vitest";

import { isOriginAllowed } from "../../../../src/infra/http/origin-check";

const ALLOWED = ["https://mifik.cl", "https://app.mifik.cl"];

describe("isOriginAllowed (security run-3 hardening)", () => {
  it("lets every read through, whatever its origin", () => {
    expect(isOriginAllowed("GET", "https://evil.mifik.cl", ALLOWED)).toBe(true);
    expect(isOriginAllowed("OPTIONS", "https://evil.example", ALLOWED)).toBe(true);
  });

  it("lets a write from an allowed origin, or with no Origin at all, through", () => {
    expect(isOriginAllowed("POST", "https://app.mifik.cl", ALLOWED)).toBe(true);
    expect(isOriginAllowed("DELETE", undefined, ALLOWED)).toBe(true);
  });

  it("refuses a write from another origin, a sibling subdomain or a null origin", () => {
    expect(isOriginAllowed("POST", "https://evil.example", ALLOWED)).toBe(false);
    expect(isOriginAllowed("PATCH", "https://old.mifik.cl", ALLOWED)).toBe(false);
    expect(isOriginAllowed("PUT", "null", ALLOWED)).toBe(false);
  });
});
