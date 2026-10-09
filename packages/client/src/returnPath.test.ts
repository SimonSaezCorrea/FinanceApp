import { describe, expect, it } from "vitest";

import { RETURN_PATH_MAX_LENGTH, safeReturnPath } from "./returnPath";

describe("safeReturnPath", () => {
  it("keeps a path inside the app, with its query and hash", () => {
    expect(safeReturnPath("/accounts/1?tab=billing#x")).toBe("/accounts/1?tab=billing#x");
    expect(safeReturnPath("/")).toBe("/");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash trick", "/\\evil.com"],
    ["absolute URL", "https://evil.com/accounts"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "accounts"],
    ["empty", ""],
  ])("sends %s to the Panel", (_, value) => {
    expect(safeReturnPath(value)).toBe("/");
  });

  it("sends a missing value to the Panel", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });

  it("refuses a path longer than the limit", () => {
    expect(safeReturnPath("/" + "a".repeat(RETURN_PATH_MAX_LENGTH))).toBe("/");
  });
});
