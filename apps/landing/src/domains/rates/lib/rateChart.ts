/**
 * The indicator pages' charts (spec 033, R6): a series turned into SVG coordinates at BUILD time,
 * so the page ships a plain `<svg>` and no chart library. Days oldest first.
 */
export interface ChartPoint {
  date: string;
  value: number;
  carried: boolean;
}

export interface ChartGeometry {
  /** `d` of the line. */
  line: string;
  /** `d` of the area under it, closed along the bottom edge. */
  area: string;
  dots: { x: number; y: number; carried: boolean }[];
  min: ChartPoint;
  max: ChartPoint;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function chartGeometry(
  points: readonly ChartPoint[],
  { width, height, padY }: { width: number; height: number; padY: number },
): ChartGeometry | null {
  if (points.length === 0) return null;
  let min = points[0]!;
  let max = points[0]!;
  for (const p of points) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
  }
  const span = max.value - min.value;
  const usable = height - 2 * padY;
  const dots = points.map((p, i) => ({
    x: points.length === 1 ? width / 2 : round((i / (points.length - 1)) * width),
    y: span === 0 ? height / 2 : round(padY + ((max.value - p.value) / span) * usable),
    carried: p.carried,
  }));
  const line = dots.map((d, i) => `${i === 0 ? "M" : "L"}${d.x} ${d.y}`).join("");
  const area = `${line}L${dots[dots.length - 1]!.x} ${height}L${dots[0]!.x} ${height}Z`;
  return { line, area, dots, min, max };
}
