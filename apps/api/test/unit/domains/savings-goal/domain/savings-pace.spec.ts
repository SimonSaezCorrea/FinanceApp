import { describe, expect, it } from "vitest";

import {
  computePace,
  monthsElapsed,
} from "../../../../../src/domains/savings-goal/domain/savings-pace";

describe("monthsElapsed", () => {
  it("is 0 within the same calendar month", () => {
    expect(monthsElapsed(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-30T00:00:00Z"))).toBe(
      0,
    );
  });

  it("counts whole calendar months crossed", () => {
    expect(monthsElapsed(new Date("2026-06-15T00:00:00Z"), new Date("2026-09-06T00:00:00Z"))).toBe(
      3,
    );
  });

  it("never goes negative", () => {
    expect(monthsElapsed(new Date("2026-09-06T00:00:00Z"), new Date("2026-06-01T00:00:00Z"))).toBe(
      0,
    );
  });
});

describe("computePace", () => {
  it("divides by 3 once the goal is at least 3 months old", () => {
    const pace = computePace(
      "300000",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-09-06T00:00:00Z"),
    );
    expect(pace).toBe("100000.0000");
  });

  it("divides by the elapsed months (minimum 1) for a younger goal", () => {
    const pace = computePace(
      "200000",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-09-06T00:00:00Z"),
    );
    expect(pace).toBe("200000.0000");
  });

  it("is 0 with no contributions in the window", () => {
    expect(
      computePace("0", new Date("2026-01-01T00:00:00Z"), new Date("2026-09-06T00:00:00Z")),
    ).toBe("0.0000");
  });
});
