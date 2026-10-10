import { useId } from "react";

import { cn } from "../lib/cn";

/** The Andes as seen from Santiago: [position along the range, height]. 0.4 is the Aconcagua. */
const ANDES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.07, 0.34],
  [0.12, 0.22],
  [0.22, 0.6],
  [0.28, 0.44],
  [0.4, 1],
  [0.47, 0.58],
  [0.55, 0.74],
  [0.62, 0.42],
  [0.71, 0.56],
  [0.8, 0.27],
  [0.89, 0.37],
  [1, 0],
];

// The range spans the word (ink 1–106 wide at 112px of Caveat Brush) and sits above it.
const X0 = -6;
const X1 = 114;
const BASE = -84;
const HEIGHT = 48;

const PEAKS = ANDES.map(([f, k]) => [X0 + (X1 - X0) * f, BASE - HEIGHT * k] as const);
const RIDGE = PEAKS.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
/** Three pencil strokes of snow under every peak above half the range's height. */
const SNOW = PEAKS.flatMap(([x, y], i) => {
  const k = (BASE - y) / HEIGHT;
  if (k < 0.5 || i === 0 || i === PEAKS.length - 1) return [];
  return [0, 6, 12].map((d) => {
    const sy = y + 9 + d * 0.9;
    return `M ${(x - 6 + d * 0.3).toFixed(1)} ${(sy + 3).toFixed(1)} L ${(x - 1 + d * 0.6).toFixed(1)} ${(sy - 1).toFixed(1)}`;
  });
});

type BrandLogoProps = Readonly<{
  className?: string;
  /** Accessible name; defaults to the product name. */
  title?: string;
}>;

/**
 * The full "Cuaderno" logo: the cordillera sketched in pencil above "fik" written with a marker.
 * Use it wherever the name is shown; `BrandMark` (the tile) is for icon-only places — the
 * collapsed rail and the favicon. Size it by height; the width follows.
 */
export function BrandLogo({ className, title = "fik" }: BrandLogoProps) {
  const filter = `fik-pencil-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="-10 -138 128 144"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("w-auto shrink-0", className)}
    >
      <defs>
        {/* A light displacement so the range reads as drawn by hand, not plotted. */}
        <filter id={filter} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves={2}
            seed={3}
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2.5} />
        </filter>
      </defs>
      <g
        filter={`url(#${filter})`}
        style={{ stroke: "hsl(var(--logo-sketch))" }}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points={RIDGE} strokeWidth={4} />
        <g strokeWidth={2}>
          {SNOW.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>
      <text
        x={0}
        y={0}
        style={{ fill: "hsl(var(--foreground))", fontFamily: '"Caveat Brush", cursive' }}
        fontSize={112}
      >
        fik
      </text>
    </svg>
  );
}
