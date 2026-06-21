import { useId } from "react";

import { cn } from "../lib/cn";

interface SparklineProps {
  /** Money decimal strings (oldest→newest). */
  data: string[];
  width?: number;
  height?: number;
  /** Visual tone of the line + fill. */
  tone?: "success" | "danger" | "muted";
  className?: string;
}

const TONES: Record<NonNullable<SparklineProps["tone"]>, string> = {
  success: "text-success",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

/** Tiny inline trend chart drawn from a balance series. No chart library. */
export function Sparkline({ data, width = 96, height = 28, tone = "muted", className }: SparklineProps) {
  const gradientId = useId();
  const nums = data.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 2) return <div style={{ width, height }} className={className} aria-hidden />;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const stepX = width / (nums.length - 1);
  const pad = 2;
  const usable = height - pad * 2;
  const points = nums.map((n, i) => {
    const x = i * stepX;
    const y = pad + (1 - (n - min) / span) * usable;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(TONES[tone], className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
