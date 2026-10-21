import { describe, expect, it } from "vitest";

import { chartGeometry } from "./rateChart";

const SIZE = { width: 300, height: 100, padY: 10 };

describe("chartGeometry (FR-008)", () => {
  const points = [
    { date: "2026-10-19", value: 10, carried: false },
    { date: "2026-10-20", value: 20, carried: true },
    { date: "2026-10-21", value: 15, carried: false },
  ];

  it("spreads the days across the width and the values within the padding", () => {
    const g = chartGeometry(points, SIZE)!;
    expect(g.dots.map((d) => d.x)).toEqual([0, 150, 300]);
    expect(g.dots.map((d) => d.y)).toEqual([90, 10, 50]);
    expect(g.line).toBe("M0 90L150 10L300 50");
    expect(g.area).toBe("M0 90L150 10L300 50L300 100L0 100Z");
  });

  it("names the extremes and marks carried days", () => {
    const g = chartGeometry(points, SIZE)!;
    expect(g.min).toMatchObject({ date: "2026-10-19", value: 10 });
    expect(g.max).toMatchObject({ date: "2026-10-20", value: 20 });
    expect(g.dots.map((d) => d.carried)).toEqual([false, true, false]);
  });

  it("draws a flat line in the middle when every value is the same", () => {
    const g = chartGeometry([points[0]!, { ...points[2]!, value: 10 }], SIZE)!;
    expect(g.dots.map((d) => d.y)).toEqual([50, 50]);
  });

  it("puts a single day in the middle, and draws nothing without days", () => {
    expect(chartGeometry([points[0]!], SIZE)!.dots[0]).toMatchObject({ x: 150, y: 50 });
    expect(chartGeometry([], SIZE)).toBeNull();
  });
});
