import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { exchangeRates } from "@finance/contracts";

import { formatRate } from "../lib/formatRate";

interface RateChartProps {
  /** Rows of ONE currency, any order. */
  readonly rows: readonly exchangeRates.ExchangeRate[];
  /** Names the chart for assistive technology ("Dólar observado"). */
  readonly label: string;
}

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);

/**
 * One line per currency — the dólar and the UF live on scales ~40× apart, so they never share
 * a chart. Tokens only; no animation (a chart that redraws on every range switch is noise).
 */
export function RateChart({ rows, label }: RateChartProps) {
  const { i18n } = useTranslation();
  const points = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((r) => ({ t: dayMs(r.date), v: Number(r.value) })),
    [rows],
  );
  const dayLabel = (ms: number, options: Intl.DateTimeFormatOptions) =>
    new Date(ms).toLocaleDateString(i18n.language, { ...options, timeZone: "UTC" });

  if (points.length < 2) return null;

  return (
    <div className="h-40" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickCount={4}
            tickFormatter={(ms: number) => dayLabel(ms, { day: "numeric", month: "short" })}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={52}
            tickCount={4}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => Math.round(v).toLocaleString(i18n.language)}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "hsl(var(--border-2))", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? payload?.[0]?.payload : null;
              if (!p) return null;
              return (
                <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs tabular-nums text-background shadow-md">
                  {dayLabel(p.t, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                  {formatRate(String(p.v), i18n.language)}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, stroke: "hsl(var(--card))", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
