import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@finance/money";

import { EstimatedTotalLine } from "../../accounts/components/EstimatedTotalLine";
import { useAuth } from "../../auth/hooks/useAuth";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";
import { PRIMARY_CURRENCY, type netWorth, type secondaryTotals } from "../lib/metrics";

const DAY_MS = 86_400_000;

/**
 * The Panel's main figure: net worth in pesos, the change over the series' window with its
 * starting date, other currencies beside it (never converted), and a real chart — y scale,
 * faint grid, an emphasized "today" and the value of any day on hover. `compact` (phone) drops
 * the axes and keeps only the first and last dates. With "ocultar saldos" on, the chart shows
 * the shape but no amounts.
 */
export function NetWorthCard({
  worth,
  secondary,
  compact = false,
  chartHeight = 180,
}: Readonly<{
  worth: ReturnType<typeof netWorth>;
  secondary: ReturnType<typeof secondaryTotals>;
  compact?: boolean;
  chartHeight?: number;
}>) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const hidden = Boolean(user?.hideBalances);
  const gradientId = useId().replaceAll(":", "");
  const fmt = (v: number | string, currency = PRIMARY_CURRENCY) =>
    formatMoney(String(v), { locale: i18n.language, currency });

  // The series ends today and steps back one day per point.
  const today = new Date();
  const points = worth.series.map((v, i) => ({
    t: today.getTime() - (worth.series.length - 1 - i) * DAY_MS,
    v: Number(v),
  }));
  const first = points[0];
  const last = points.at(-1);
  const pct = worth.changePct;
  const up = pct !== null && pct >= 0;
  const dayLabel = (ms: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(ms).toLocaleDateString(i18n.language, opts);
  const compactNumber = new Intl.NumberFormat(i18n.language, {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <Card className="flex flex-col gap-2 p-5">
      <span className="text-sm font-medium text-muted-foreground">
        {t("dashboard.netWorth")} · {PRIMARY_CURRENCY}
      </span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
        <MaskedAmount>{fmt(worth.total)}</MaskedAmount>
      </span>
      {pct !== null && first && last ? (
        <span className="text-sm text-muted-foreground">
          <span className={cn("font-semibold", up ? "text-success" : "text-destructive")}>
            {up ? "+" : ""}
            {pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%
          </span>{" "}
          {t("dashboard.netWorthSince", {
            date: dayLabel(first.t, { day: "numeric", month: "long" }),
          })}
          {hidden ? null : (
            <span className="tabular-nums">
              {" "}
              ({up ? "+" : ""}
              {fmt(last.v - first.v)})
            </span>
          )}
        </span>
      ) : null}

      {secondary.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {secondary.map((s) => (
            <span
              key={s.currency}
              className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground"
            >
              <MaskedAmount>
                <span className="font-semibold text-foreground">{fmt(s.total, s.currency)}</span>
              </MaskedAmount>
            </span>
          ))}
          <span className="text-xs text-muted-foreground">{t("dashboard.otherCurrencies")}</span>
        </div>
      ) : null}
      {/* Spec 030: the one estimated total in pesos, beside (never replacing) the figures above. */}
      <EstimatedTotalLine
        nets={[
          { currency: PRIMARY_CURRENCY, net: String(worth.total) },
          ...secondary.map((s) => ({ currency: s.currency, net: String(s.total) })),
        ]}
        className="text-xs text-muted-foreground"
      />

      {points.length >= 2 ? (
        <div
          className="mt-2"
          style={{ height: chartHeight }}
          role="img"
          aria-label={t("dashboard.netWorthChart", {
            from: dayLabel(points[0]!.t, { day: "numeric", month: "long" }),
            to: dayLabel(points.at(-1)!.t, { day: "numeric", month: "long" }),
          })}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 6, right: 20, bottom: 0, left: compact ? 8 : 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                  <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              {compact ? null : (
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
              )}
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={
                  compact
                    ? [points[0]!.t, points.at(-1)!.t]
                    : [0, 0.33, 0.66, 1].map((f) => points[Math.round(f * (points.length - 1))]!.t)
                }
                tickFormatter={(ms: number) => dayLabel(ms, { day: "numeric", month: "short" })}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis
                hide={compact || hidden}
                width={44}
                tickCount={4}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => compactNumber.format(v)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                // Recharts slides the tooltip from its last spot by default: it lagged behind
                // the pointer and landed late on the day. It should just be there.
                isAnimationActive={false}
                offset={12}
                cursor={{ stroke: "hsl(var(--border-2))", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const p = active ? payload?.[0]?.payload : null;
                  if (!p) return null;
                  return (
                    <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs tabular-nums text-background shadow-md">
                      {dayLabel(p.t, { weekday: "short", day: "numeric", month: "short" })}
                      {hidden ? null : ` · ${fmt(p.v)}`}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                activeDot={{
                  r: 4,
                  stroke: "hsl(var(--card))",
                  strokeWidth: 2,
                  fill: "hsl(var(--primary))",
                }}
                dot={(props: { cx?: number; cy?: number; index?: number }) =>
                  props.index === points.length - 1 ? (
                    <circle
                      key="today"
                      cx={props.cx}
                      cy={props.cy}
                      r={4.5}
                      fill="hsl(var(--primary))"
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    />
                  ) : (
                    <g key={`p${props.index}`} />
                  )
                }
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </Card>
  );
}
