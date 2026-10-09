import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { exchangeRates } from "@finance/contracts";

import { formatRate } from "../lib/formatRate";

interface RateChartProps {
  /** Rows of ONE currency, any order. */
  readonly rows: readonly exchangeRates.ExchangeRate[];
  /** Names the chart for assistive technology ("Dólar observado"). */
  readonly label: string;
  /** The series color, a CSS color built from a token (`hsl(var(--primary))`). */
  readonly color: string;
  /** Unique per chart on the page: names its fill gradient. */
  readonly id: string;
  /** Today (`YYYY-MM-DD`): the last date reads "hoy" when it is today. */
  readonly today: string;
}

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
/** Most points the line draws: a range of years is thinned so the chart stays light. */
const MAX_POINTS = 500;

interface Point {
  t: number;
  v: number;
  carried: boolean;
}

/** Every `step`-th point, always keeping the first, the last, the high and the low. */
function thin(points: Point[]): Point[] {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  let hi = 0;
  let lo = 0;
  points.forEach((p, i) => {
    if (p.v > points[hi]!.v) hi = i;
    if (p.v < points[lo]!.v) lo = i;
  });
  return points.filter((_, i) => i % step === 0 || i === points.length - 1 || i === hi || i === lo);
}

/**
 * The currency's line over the range, stripped to what the headline above doesn't already say:
 * no value axis or grid (the figures live in the tiles), the range's start and end dates, the
 * high annotated on the line, a dotted rule at the low and a dot on the latest value. Linear,
 * never smoothed: a curve would invent values between two real days. No animation.
 */
export function RateChart({ rows, label, color, id, today }: RateChartProps) {
  const { t, i18n } = useTranslation();
  const points = useMemo(
    () =>
      thin(
        [...rows]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((r) => ({
            t: dayMs(r.date),
            v: Number(r.value),
            carried: exchangeRates.isCarried(r),
          })),
      ),
    [rows],
  );
  const dayLabel = (ms: number, options: Intl.DateTimeFormatOptions) =>
    new Date(ms).toLocaleDateString(i18n.language, { ...options, timeZone: "UTC" });

  if (points.length < 2) return null;
  const gradient = `rate-fill-${id}`;
  const first = points[0]!;
  const end = points[points.length - 1]!;
  let high = first;
  let low = first;
  for (const p of points) {
    if (p.v > high.v) high = p;
    if (p.v < low.v) low = p;
  }
  const todayMs = dayMs(today);
  // A range across years names the year on its ends.
  const spansYears = new Date(first.t).getUTCFullYear() !== new Date(end.t).getUTCFullYear();
  const edgeLabel = (ms: number) =>
    ms === todayMs
      ? t("exchangeRates.chart.today")
      : dayLabel(ms, {
          day: "numeric",
          month: "short",
          ...(spansYears ? { year: "numeric" } : {}),
        });
  // The label of the high goes inward near either edge, so the chart border never cuts it.
  const highAt = (high.t - first.t) / (end.t - first.t || 1);
  let highPosition: "top" | "left" | "right" = "top";
  if (highAt > 0.85) highPosition = "left";
  else if (highAt < 0.15) highPosition = "right";

  return (
    <div className="h-72" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 28, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.28} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={[first.t, end.t]}
            interval={0}
            // The two edge dates hang inward (start-aligned left, end-aligned right): never cut.
            tick={({ x, y, payload }) => (
              <text
                x={x}
                y={Number(y) + 14}
                textAnchor={payload.value === first.t ? "start" : "end"}
                fill="hsl(var(--muted-foreground))"
                fontSize={12}
              >
                {edgeLabel(Number(payload.value))}
              </text>
            )}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            padding={{ left: 0, right: 0 }}
          />
          {/* A little room under the low so its dotted rule doesn't sit on the axis. */}
          <YAxis hide domain={[low.v - (high.v - low.v || 1) * 0.08, high.v]} />
          <ReferenceLine
            y={low.v}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.5}
            strokeDasharray="2 5"
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "hsl(var(--border-2))", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? payload?.[0]?.payload : null;
              if (!p) return null;
              return (
                <div className="flex min-w-36 flex-col gap-0.5 rounded-lg border border-border2 bg-surface2 px-3 py-2 text-xs shadow-md">
                  <span className="text-muted-foreground">
                    {dayLabel(p.t, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatRate(String(p.v), i18n.language)}
                  </span>
                  {p.carried ? (
                    <span className="text-muted-foreground">{t("exchangeRates.carriedShort")}</span>
                  ) : null}
                </div>
              );
            }}
          />
          <Area
            type="linear"
            dataKey="v"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            fill={`url(#${gradient})`}
            isAnimationActive={false}
            activeDot={{ r: 4, stroke: "hsl(var(--background))", strokeWidth: 2 }}
          />
          <ReferenceDot
            x={high.t}
            y={high.v}
            r={4}
            fill="hsl(var(--background))"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            ifOverflow="visible"
            label={{
              value: t("exchangeRates.chart.high", {
                value: formatRate(String(high.v), i18n.language),
              }),
              position: highPosition,
              offset: 10,
              fill: "hsl(var(--foreground))",
              fontSize: 12,
            }}
          />
          <ReferenceDot
            x={end.t}
            y={end.v}
            r={5}
            fill={color}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            ifOverflow="visible"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
