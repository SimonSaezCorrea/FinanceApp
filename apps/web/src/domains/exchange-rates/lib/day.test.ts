import { describe, expect, it } from "vitest";

import { splitRange } from "./day";

describe("splitRange", () => {
  it("keeps a range that fits as one window", () => {
    expect(splitRange("2026-01-01", "2026-01-10", 400)).toEqual([
      { from: "2026-01-01", to: "2026-01-10" },
    ]);
  });

  it("cuts a long range into consecutive windows with no gap or overlap", () => {
    expect(splitRange("2026-01-01", "2026-01-25", 10)).toEqual([
      { from: "2026-01-01", to: "2026-01-10" },
      { from: "2026-01-11", to: "2026-01-20" },
      { from: "2026-01-21", to: "2026-01-25" },
    ]);
  });

  it("is empty for an inverted range", () => {
    expect(splitRange("2026-02-01", "2026-01-01", 10)).toEqual([]);
  });
});
