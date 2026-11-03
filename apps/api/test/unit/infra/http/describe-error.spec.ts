import { describe, expect, it } from "vitest";

import {
  describeError,
  pathOnly,
  reportableError,
} from "../../../../src/infra/http/describe-error";

describe("describeError", () => {
  it("keeps one bounded line of an unnamed error", () => {
    const long = new Error(`first line ${"x".repeat(400)}\nsecond line with ana@mail.cl`);
    const text = describeError(long);
    expect(text.startsWith("Error: first line")).toBe(true);
    expect(text).not.toContain("ana@mail.cl");
    expect(text.length).toBeLessThanOrEqual(301);
  });
});

describe("pathOnly", () => {
  it("drops the query and the hash", () => {
    expect(pathOnly("/api/v1/transactions?cursor=abc#top")).toBe("/api/v1/transactions");
    expect(pathOnly("/api/v1/health")).toBe("/api/v1/health");
  });
});

describe("reportableError", () => {
  it("carries the description and the original frames, never the raw message", () => {
    const original = new TypeError("boom\n  where: { rut: '12345678' }");
    const reported = reportableError(original);

    expect(reported.name).toBe("TypeError");
    expect(reported.message).toBe("TypeError: boom");
    expect(reported.stack).not.toContain("12345678");
    expect(reported.stack).toContain("at ");
  });
});
